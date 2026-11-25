const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>deps[name]||require(name),out);return out;}
const period=load('lib/closing-period.ts'),monthly=load('lib/monthly-statement.ts');
const finance=load('lib/monthly-financials.ts',{'./db':{},'./monthly-statement':monthly});
const sessions=load('lib/closing-sessions.ts',{'./db':{},'./closing-period':period,'./monthly-closing':{},'./monthly-financials':finance});
test('custom periods use inclusive Pakistan dates across months and leap days',()=>{
 const r=period.closingPeriod('2024-02-29','2024-03-02',new Date('2024-03-02T20:00:00Z'));assert.equal(r.cutoff,'2024-03-03');
 assert.equal(period.nextDate('2026-12-31'),'2027-01-01');
 for(const dates of [['2026-02-30','2026-03-01'],['2026-10-23','2026-10-22'],['2026-10-23','2026-10-24']])assert.throws(()=>period.closingPeriod(...dates,new Date('2026-10-23T10:00:00Z')));
});
test('closed sessions advance automatically, reopened snapshots do not advance the start',()=>{
 assert.equal(sessions.nextSessionStart([{status:'CLOSED',through_date:'2026-10-23'},{status:'REOPENED',through_date:'2026-10-30'}],'2026-10-01'),'2026-10-24');
 assert.equal(sessions.nextSessionStart([],'2026-09-01'),'2026-09-01');
 const closed=[{from_date:'2026-10-01',through_date:'2026-10-15'}];
 assert.equal(period.validateSessionSequence('2026-10-16','2026-10-23',closed),true);
 assert.equal(period.validateSessionSequence('2026-10-01','2026-10-15',closed),false);
 assert.throws(()=>period.validateSessionSequence('2026-10-15','2026-10-23',closed),/overlaps/);
 assert.throws(()=>period.validateSessionSequence('2026-10-17','2026-10-23',closed),/avoid a gap/);
});
test('invoice classification uses session start, including previous invoices in the same month',()=>{
 const [s]=monthly.buildMonthlyStatements([{id:'1',invoice_no:'I-1',shop_id:'1',shop_name:'Shop',issue_date:'2026-10-10',original:'100',opening:'80',received:'30',credits:'0',closing:'50'}],'2026-10',new Map([['1',80]]),'2026-10-16');
 assert.equal(s.currentSales,0);assert.equal(s.previousReceived,30);assert.equal(s.previousRemaining,50);assert.equal(s.openingAdjustment,0);
});
test('custom financial SQL uses exact start and following-day cutoff without recharging old goods',async()=>{
 const calls=[];
 const f=load('lib/monthly-financials.ts',{'./monthly-statement':monthly,'./db':{query:async(sql,args)=>{calls.push({sql,args});return sql.includes('AS opening_result')?[{opening_result:-70}]:[];}}});
 const result=await f.monthlyFinancials('2020-09',null,undefined,{from:'2020-09-16',to:'2020-10-05',previousResult:-70});
 assert.equal(result.from,'2020-09-16');assert.equal(result.through,'2020-10-05');assert.equal(result.closingResult,-70);assert.equal(result.netGoodsCost,0);
 assert.deepEqual(calls[0].args,['2020-09-16','2020-10-06',null]);assert.deepEqual(calls[2].args,['2020-09-16','2020-10-06']);
});
function harness(){
 const records=[],calls=[];
 const deps={'@/lib/auth':{requireRole:async()=>({id:7})},'@/lib/utils':load('lib/utils.ts'),'@/lib/closing-period':period,'@/lib/monthly-financials':finance,
  '@/lib/closing-sessions':{validScope:sessions.validScope,sessionPreview:async()=>({statements:[],financials:finance.collectionClosing({from:'2020-09-01',through:'2020-09-15',goods:[],returns:[],expenses:[],payments:[]})})},
  'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:path=>{throw Object.assign(new Error('redirect'),{path});}},
  '@/lib/db':{transaction:async fn=>fn({query:async(sql,args)=>{calls.push(sql);
   if(sql.startsWith('SELECT id,to_char'))return {rows:records.filter(r=>r.status==='CLOSED')};
   if(sql.startsWith('INSERT INTO public.closing_sessions')){const row={id:String(records.length+1),scope_key:args[0],from_date:args[1],through_date:args[2],snapshot:JSON.parse(args[3]),status:'CLOSED'};records.push(row);return {rows:[row]};}
   if(sql.startsWith('SELECT scope_key'))return {rows:records.filter(r=>r.id===String(args[0]))};
   if(sql.startsWith('SELECT *,to_char'))return {rows:records.filter(r=>r.id===String(args[0]))};
   if(sql.startsWith('SELECT id FROM public.closing_sessions'))return {rows:records.filter(r=>r.status==='CLOSED'&&r.through_date>args[1])};
   if(sql.startsWith('UPDATE public.closing_sessions')){records.find(r=>r.id===String(args[2])).status='REOPENED';return {rows:[]};}
   return {rows:[]};
  }})}};
 return {actions:load('app/closing-session-actions.ts',deps),records,calls};
}
const form=(from,to)=>{const f=new FormData();f.set('from',from);f.set('to',to);return f;};
test('closing redirects to the next session, reopening retains snapshots and enforces reverse order',async()=>{
 const h=harness();
 await assert.rejects(h.actions.closeSession({},form('2020-09-01','2020-09-15')),e=>e.path==='/monthly-closing?shop=');
 await assert.rejects(h.actions.closeSession({},form('2020-09-16','2020-09-23')),e=>e.path==='/monthly-closing?shop=');
 assert.equal(h.records.length,2);
 const first=new FormData();first.set('session','1');assert.match((await h.actions.reopenSession({},first)).error,/later sessions first/);
 const second=new FormData();second.set('session','2');await assert.rejects(h.actions.reopenSession({},second),e=>e.path.includes('from=2020-09-16'));
 assert.equal(h.records[1].status,'REOPENED');assert.ok(h.records[1].snapshot.financials);
 assert.equal(sessions.nextSessionStart(h.records,'2020-09-01'),'2020-09-16');
 assert.ok(!h.calls.some(sql=>/UPDATE (invoices|payments)|INSERT INTO (invoices|payments|expenses)/.test(sql)));
});
test('custom-range PDF and Word model labels previous invoices by the actual start date',()=>{
 const row={id:'1',invoice_no:'HBC-000001-INV-0001',shop_id:'1',shop_name:'Shop',issue_date:'2020-09-10',original:'100',opening:'80',received:'30',credits:'0',closing:'50'};
 const statements=monthly.buildMonthlyStatements([row],'2020-09',new Map(),'2020-09-16');
 const financials=finance.collectionClosing({from:'2020-09-16',through:'2020-10-05',goods:[],returns:[],expenses:[],payments:[]});
 const report=load('lib/session-report-document.ts',{'./monthly-report-document':load('lib/monthly-report-document.ts',{'./monthly-financials':finance,'./utils':load('lib/utils.ts')}),'./monthly-financials':finance}).sessionReportDocument({statements,financials},'2020-09-16','2020-10-05','Owner','Shop','Live report');
 assert.equal(report.title,'Closing session report');assert.equal(report.period,'2020-09-16 to 2020-10-05');
 assert.equal(report.tables.find(t=>t.title==='Shop invoice detail').rows[0][1],'Previous');assert.ok(!report.metrics.some(m=>m.label.includes('next month')));
});
