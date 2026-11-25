// Read-only reconciliation of monthly statements against invoice allocations.
const fs=require('node:fs'),ts=require('typescript'),pg=require('pg');
require('dotenv').config({path:'.env.local',quiet:true});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true}});
function load(file,deps={}){const result={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name]||require(name),result);return result;}
const helpers=load('lib/monthly-statement.ts');
const service=load('lib/monthly-closing.ts',{'./monthly-statement':helpers,'./db':{query:async(sql,args)=>(await pool.query(sql,args)).rows}});
async function run(){try{
 const month=process.argv[2]||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit'}).format(new Date());
 const result=await service.liveMonthlyStatements(month);
 for(const s of result.statements){const expected=s.opening+s.currentSales-s.previousReceived-s.currentReceived-s.previousCredits-s.currentCredits;if(Math.abs(expected-s.closing)>.005||Math.abs(s.previousRemaining+s.currentRemaining-s.closing)>.005)throw new Error('Statement does not reconcile.');}
 const {rows:[expected]}=await pool.query(`SELECT COALESCE(SUM(i.total
  -COALESCE((SELECT SUM(pa.amount) FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id WHERE pa.invoice_id=i.id AND p.payment_date<$1::date),0)
  -COALESCE((SELECT SUM(r.total_credit) FROM sales_returns r WHERE r.invoice_id=i.id AND (r.created_at AT TIME ZONE 'Asia/Karachi')::date<$1::date),0)),0) AS closing
  FROM invoices i WHERE i.issue_date<$1::date`,[result.range.cutoff]);
 if(Math.abs(result.statements.reduce((sum,s)=>sum+s.closing,0)-Number(expected.closing))>.005)throw new Error('Monthly total differs from source invoices.');
 const previous=await service.liveMonthlyStatements(result.range.previousMonth);
 if(Math.abs(previous.statements.reduce((sum,s)=>sum+s.closing,0)-result.statements.reduce((sum,s)=>sum+s.opening,0))>.005)throw new Error('Previous month does not carry into this month.');
 await service.savedMonthlyStatements(month);
 const financeService=load('lib/monthly-financials.ts',{'./monthly-statement':helpers,'./db':{query:async(sql,args)=>(await pool.query(sql,args)).rows}});
 const finance=await financeService.monthlyFinancials(month);
 const {rows:[actual]}=await pool.query(`SELECT
 (SELECT COALESCE(SUM(total),0) FROM invoices WHERE issue_date >= $1::date AND issue_date < $2::date) AS sales,
 (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date >= $1::date AND expense_date < $2::date) AS expenses,
 (SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date >= $1::date AND payment_date < $2::date) AS received`,[result.range.start,result.range.cutoff]);
 for(const [field,value] of [['sales',finance.sales],['expenses',finance.businessExpenses],['received',finance.received]])if(Math.abs(Number(actual[field])-value)>.005)throw new Error('Financial register total does not reconcile: '+field);
 if(Math.abs(finance.received-finance.netGoodsCost-finance.deductedExpenses-finance.netProfit)>.005)throw new Error('Profit formula does not reconcile');
 if(Math.abs(finance.openingResult+finance.netProfit-finance.closingResult)>.005)throw new Error('Carried closing result does not reconcile');
 const docService=load('lib/monthly-closing-document.ts',{'./db':{query:async(sql,args)=>(await pool.query(sql,args)).rows}});await docService.savedClosingDocument(month,null);
 console.log('PASS: expense, historical goods cost, returns, payment receipt queries and profit formula.');
 console.log('PASS: monthly SQL, invoice reconciliation, saved-summary reads and previous-to-current carry forward. No records were changed.');
}finally{await pool.end();}}
run().catch(error=>{console.error(error.message||error.code);process.exitCode=1;});
