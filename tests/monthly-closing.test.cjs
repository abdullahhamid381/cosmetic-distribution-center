const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>deps[name]||require(name),out);return out;}
const helpers=load('lib/monthly-statement.ts');
const financeHelpers=load('lib/monthly-financials.ts',{'./db':{},'./monthly-statement':helpers});
const old={id:'1',invoice_no:'INV-OLD',shop_id:'1',shop_name:'Shop One',issue_date:'2026-09-01',original:'12000',opening:'10000',received:'3000',credits:'500',closing:'6500'};
const current={id:'2',invoice_no:'INV-NEW',shop_id:'1',shop_name:'Shop One',issue_date:'2026-10-01',original:'5000',opening:'0',received:'1000',credits:'200',closing:'3800'};

test('monthly balance separates previous and current dues without duplicating debt',()=>{
 const [s]=helpers.buildMonthlyStatements([old,current],'2026-10');
 assert.equal(s.opening,10000);assert.equal(s.currentSales,5000);assert.equal(s.previousReceived,3000);assert.equal(s.currentReceived,1000);
 assert.equal(s.previousRemaining,6500);assert.equal(s.currentRemaining,3800);assert.equal(s.closing,10300);
 assert.equal(s.opening+s.currentSales-s.previousReceived-s.currentReceived-s.previousCredits-s.currentCredits,s.closing);
});
test('saved prior closing discrepancies are explicit adjustments',()=>{
 const [s]=helpers.buildMonthlyStatements([old,current],'2026-10',new Map([['1',9000]]));
 assert.equal(s.savedOpening,9000);assert.equal(s.openingAdjustment,1000);
 assert.equal(s.savedOpening+s.openingAdjustment,s.opening);
});
test('next month treats both older invoice balances as previous dues',()=>{
 const next=[{...old,opening:'6500',received:'0',credits:'0',closing:'6500'},{...current,opening:'3800',received:'0',credits:'0',closing:'3800'}];
 const [s]=helpers.buildMonthlyStatements(next,'2026-11',new Map([['1',10300]]));
 assert.equal(s.opening,10300);assert.equal(s.previousRemaining,10300);assert.equal(s.currentSales,0);assert.equal(s.currentRemaining,0);assert.equal(s.openingAdjustment,0);
});
test('month bounds use Pakistan time and current months can close through today',()=>{
 const now=new Date('2026-10-22T20:00:00Z');
 const current=helpers.monthlyRange('2026-10',now);assert.equal(current.today,'2026-10-23');assert.equal(current.cutoff,'2026-10-24');assert.equal(current.canClose,true);assert.equal(current.isComplete,false);
 const prior=helpers.monthlyRange('2026-09',now);assert.equal(prior.canClose,true);assert.equal(prior.cutoff,'2026-10-01');assert.equal(prior.end,'2026-09-30');
 assert.equal(helpers.monthlyRange('2026-01',now).previousMonth,'2025-12');
 for(const value of ['2026-13','2026-11','wrong','1999-12'])assert.throws(()=>helpers.monthlyRange(value,now));
});
test('closing is idempotent, audited and never changes invoices or payments',async()=>{
 const calls=[];let inserted=false;
 const deps={
  '@/lib/auth':{requireRole:async()=>({id:7})},'@/lib/utils':load('lib/utils.ts'),
  '@/lib/monthly-statement':helpers,
  '@/lib/monthly-financials':{isCompleteFinancialSnapshot:financeHelpers.isCompleteFinancialSnapshot,monthlyFinancials:async()=>financeHelpers.collectionClosing({from:'2020-09-01',through:'2020-09-30',expenses:[],goods:[],payments:[],returns:[]})},
  '@/lib/monthly-closing':{liveMonthlyStatements:async()=>({statements:helpers.buildMonthlyStatements([old,current],'2020-09')})},
  'next/cache':{revalidatePath:()=>{}},
  '@/lib/db':{transaction:async fn=>fn({query:async(sql,args)=>{calls.push({sql,args});if(sql.includes('INSERT INTO public.monthly_closings')){if(inserted)return {rows:[]};inserted=true;return {rows:[{id:4}]};}return {rows:[]};}})},
 };
 const {closeMonth}=load('app/monthly-closing-actions.ts',deps);
 const form=new FormData();form.set('month','2020-09');
 const first=await closeMonth({error:'',message:''},form),second=await closeMonth({error:'',message:''},form);
 assert.match(first.message,/1 shop closing saved/);assert.match(second.message,/Existing saved summaries/);
 assert.equal(calls.filter(c=>c.sql.includes('INSERT INTO public.audit_logs')).length,1);
 assert.ok(!calls.some(c=>/UPDATE (invoices|payments)|INSERT INTO (invoices|payments|expenses)/.test(c.sql)));
});
test('live query is date bounded and retains adjustments for deleted old invoices',async()=>{
 const calls=[];
 const {liveMonthlyStatements}=load('lib/monthly-closing.ts',{'./monthly-statement':helpers,'./db':{query:async(sql,args)=>{calls.push({sql,args});return sql.startsWith('SELECT shop_id')?[{shop_id:'1',snapshot:{shopName:'Shop One',closing:100}}]:[];}}});
 const result=await liveMonthlyStatements('2020-09','1');assert.equal(result.statements[0].openingAdjustment,-100);assert.equal(result.statements[0].closing,0);
 const q=calls.find(c=>c.sql.includes('WITH paid AS'));assert.deepEqual(q.args,['2020-09-01','2020-10-01','1']);
 assert.match(q.sql,/payment_date<\$2/);assert.match(q.sql,/created_at AT TIME ZONE 'Asia\/Karachi'/);
});
