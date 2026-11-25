const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>deps[name]||require(name),out);return out;}
const helpers=load('lib/monthly-statement.ts');
const financeHelpers=load('lib/monthly-financials.ts',{'./db':{},'./monthly-statement':helpers});
function harness({whole=false,fail=false}={}){
 const calls=[],state={closed:false,archive:[],rolledBack:false};
 const actions=load('app/monthly-closing-actions.ts',{
  '@/lib/auth':{requireRole:async(...roles)=>{assert.deepEqual(roles,['ADMIN','MANAGER','ACCOUNTS']);return {id:7};}},
  '@/lib/utils':load('lib/utils.ts'),'next/cache':{revalidatePath:()=>{}},
  '@/lib/monthly-statement':{monthlyRange:m=>helpers.monthlyRange(m,new Date('2026-10-23T05:00:00Z'))},
  '@/lib/monthly-closing':{liveMonthlyStatements:async()=>({statements:[]})},
  '@/lib/monthly-financials':{isCompleteFinancialSnapshot:financeHelpers.isCompleteFinancialSnapshot,monthlyFinancials:async()=>financeHelpers.collectionClosing({from:'2026-10-01',through:'2026-10-23',netGoodsCost:100,goods:[],returns:[],expenses:[],payments:[]})},
  '@/lib/db':{transaction:async fn=>{const before=JSON.parse(JSON.stringify(state));try{return await fn({query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.startsWith('SELECT id FROM shops'))return {rows:[{id:1}]};
   if(sql.includes('scope_key IN (0,$2'))return {rows:state.closed?[{id:1}]:[]};
   if(sql.includes('scope_key=0'))return {rows:whole?[{id:1}]:[]};
   if(sql.startsWith('SELECT * FROM public.monthly_closing_documents'))return {rows:state.closed?[{id:1,snapshot:{financials:{netProfit:-100}}}]:[]};
   if(sql.startsWith('SELECT * FROM public.monthly_closings'))return {rows:[]};
   if(sql.includes('INSERT INTO public.monthly_closing_documents')){if(state.closed)return {rows:[]};state.closed=true;return {rows:[{id:1}]};}
   if(sql.includes('INSERT INTO public.monthly_closing_revisions')){state.archive.push(JSON.parse(args[2]));return {rows:[{id:2}]};}
   if(sql.startsWith('DELETE FROM public.monthly_closing_documents')){state.closed=false;return {rows:[]};}
   if(fail&&sql.includes('REOPEN_CLOSING'))throw new Error('audit failure');
   return {rows:[]};
  }});}catch(e){Object.assign(state,before,{rolledBack:true});throw e;}}},
 });
 return {actions,state,calls};
}
const form=(shop='')=>{const f=new FormData();f.set('month','2026-10');f.set('shop',shop);f.set('reason','Late payment received');return f;};
test('current month closes, reopens with archived snapshot, and can close again',async()=>{
 const h=harness(),f=form();
 assert.equal((await h.actions.closeMonth({},f)).error,'');assert.equal(h.state.closed,true);
 await h.actions.closeMonth({},f);assert.equal(h.calls.filter(c=>c.sql.includes('INSERT INTO public.monthly_closing_documents')).length,1);
 const reopened=await h.actions.reopenMonth({},f);assert.equal(reopened.error,'');assert.match(reopened.message,/reopened/);assert.equal(h.state.closed,false);assert.equal(h.state.archive.length,1);
 assert.equal(h.state.archive[0].documents[0].snapshot.financials.netProfit,-100);
 await h.actions.reopenMonth({},f);assert.equal(h.state.archive.length,1);
 assert.equal((await h.actions.closeMonth({},f)).error,'');assert.equal(h.state.closed,true);
 assert.ok(!h.calls.some(c=>/UPDATE (invoices|payments)|INSERT INTO (invoices|payments|expenses)/.test(c.sql)));
});
test('shop reopening cannot leave an overlapping all-shops snapshot active',async()=>{
 const h=harness({whole:true});h.state.closed=true;
 const result=await h.actions.reopenMonth({},form('1'));assert.match(result.error,/Select All shops/);assert.equal(h.state.closed,true);assert.equal(h.state.archive.length,0);
});
test('failed reopening rolls back archived and active closing changes together',async()=>{
 const h=harness({fail:true});h.state.closed=true;
 const result=await h.actions.reopenMonth({},form());assert.ok(result.error);assert.equal(h.state.closed,true);assert.equal(h.state.archive.length,0);assert.equal(h.state.rolledBack,true);
});
