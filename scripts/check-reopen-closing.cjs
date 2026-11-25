const pg=require('pg'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require('dotenv').config({path:'.env.local',quiet:true});
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>deps[name]||require(name),out);return out;}
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
(async()=>{try{
 await client.connect();
 // Transaction-pooling databases cannot keep temporary tables across commits.
 // Pin one transaction for setup and the entire test; always roll it back.
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 // All lifecycle writes target session-local copies with independent sequences.
 const suffix=Date.now().toString(36),names=['monthly_closing_documents','monthly_closings','monthly_closing_revisions','audit_logs'];
 const table=name=>`pg_temp.qa_${name}_${suffix}`;
 for(const name of names){
  await client.query(`CREATE TEMP TABLE qa_${name}_${suffix} (LIKE public.${name} INCLUDING ALL)`);
  await client.query(`CREATE TEMP SEQUENCE qa_${name}_${suffix}_id`);
  await client.query(`ALTER TABLE ${table(name)} ALTER COLUMN id SET DEFAULT nextval('pg_temp.qa_${name}_${suffix}_id')`);
 }
 const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
 const statement={shopId:'1',shopName:'QA Store',month,opening:0,currentSales:100,closing:100,invoices:[]};
 const finance=load('lib/monthly-financials.ts',{'./db':{},'./monthly-statement':load('lib/monthly-statement.ts')});
 const proxy={query:async(sql,args)=>sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'?{rows:[]}:client.query(sql.replace(/\b(?:public\.)?(monthly_closing_documents|monthly_closings|monthly_closing_revisions|audit_logs)\b/g,(_,name)=>table(name)),args)};
 const actions=load('app/monthly-closing-actions.ts',{
  '@/lib/auth':{requireRole:async()=>({id:1})},'@/lib/utils':load('lib/utils.ts'),'@/lib/monthly-statement':load('lib/monthly-statement.ts'),
  '@/lib/monthly-closing':{liveMonthlyStatements:async()=>({statements:[statement]})},
  '@/lib/monthly-financials':{isCompleteFinancialSnapshot:finance.isCompleteFinancialSnapshot,monthlyFinancials:async()=>finance.collectionClosing({from:month+'-01',through:month+'-23',goods:[],returns:[],expenses:[],payments:[]})},'next/cache':{revalidatePath:()=>{}},
  '@/lib/db':{transaction:async fn=>{await client.query('SAVEPOINT qa_action');try{const result=await fn(proxy);await client.query('RELEASE SAVEPOINT qa_action');return result;}catch(e){await client.query('ROLLBACK TO SAVEPOINT qa_action');throw e;}}},
 });
 const form=new FormData();form.set('month',month);form.set('reason','QA reopening');
 let result=await actions.closeMonth({},form);assert.equal(result.error,'',result.error);
 result=await actions.reopenMonth({},form);assert.equal(result.error,'',result.error);
 assert.equal((await proxy.query('SELECT count(*) AS n FROM monthly_closing_documents')).rows[0].n,'0');
 assert.equal((await proxy.query('SELECT count(*) AS n FROM monthly_closings')).rows[0].n,'0');
 const revision=(await proxy.query('SELECT snapshot FROM monthly_closing_revisions')).rows[0];assert.equal(revision.snapshot.documents.length,1);assert.equal(revision.snapshot.statements.length,1);
 result=await actions.closeMonth({},form);assert.equal(result.error,'',result.error);
 assert.equal((await proxy.query('SELECT count(*) AS n FROM monthly_closing_documents')).rows[0].n,'1');
 assert.equal((await proxy.query("SELECT count(*) AS n FROM audit_logs WHERE action='REOPEN_CLOSING'")).rows[0].n,'1');
 await client.query('ROLLBACK');
 console.log('Current-month close, archive, reopen, and reclose verified in one rolled-back transaction.');
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await client.end().catch(()=>{});}})();
