const pg=require('pg'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require('dotenv').config({path:'.env.local',quiet:true});
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>deps[name]||require(name),out);return out;}
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
(async()=>{try{
 await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const db={query:async(sql,args)=>(await c.query(sql,args)).rows},period=load('lib/closing-period.ts'),monthly=load('lib/monthly-statement.ts');
 const financial=load('lib/monthly-financials.ts',{'./db':db,'./monthly-statement':monthly});
 const statement=load('lib/monthly-closing.ts',{'./db':db,'./monthly-statement':monthly});
 const sessions=load('lib/closing-sessions.ts',{'./db':db,'./closing-period':period,'./monthly-closing':statement,'./monthly-financials':financial});
 const today=period.pakistanToday(),start=today.slice(0,7)+'-01',split=today.slice(0,7)+'-15';
 const all=await sessions.sessionPreview(start,today,'');
 const direct=(await c.query('SELECT (SELECT COALESCE(sum(amount),0) FROM public.expenses WHERE expense_date BETWEEN $1::date AND $2::date) AS expense,(SELECT COALESCE(sum(amount),0) FROM public.payments WHERE payment_date BETWEEN $1::date AND $2::date) AS received',[start,today])).rows[0];
 assert.equal(all.financials.businessExpenses,Number(direct.expense));assert.equal(all.financials.received,Number(direct.received));
 if(today>split){
  const before=await sessions.sessionPreview(start,split,''),after=await sessions.sessionPreview(period.nextDate(split),today,'');
  for(const field of ['sales','received','businessExpenses','netGoodsCost'])assert.ok(Math.abs(before.financials[field]+after.financials[field]-all.financials[field])<.005,field+' split mismatch');
  assert.ok(Math.abs(before.financials.closingResult-after.financials.openingResult)<.005,'Opening carry mismatch');
 }
 for(const s of all.statements)assert.ok(Math.abs(s.opening+s.currentSales-s.previousReceived-s.currentReceived-s.previousCredits-s.currentCredits-s.closing)<.005);
 const history=await sessions.sessionHistory('');for(const s of history)assert.ok(s.from_date<=s.through_date);
 await c.query('ROLLBACK');console.log('Read-only custom-range QA passed: expenses, receipts, goods costs, split periods, and carried balances reconcile.');
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await c.end().catch(()=>{});}})();
