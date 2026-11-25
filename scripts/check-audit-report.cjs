const pg=require('pg'),fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
require('dotenv').config({path:'.env.local',quiet:true});
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
const service={};new Function('require','exports',ts.transpileModule(fs.readFileSync('lib/audit-report.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='./db'?{query:async(sql,args)=>(await client.query(sql,args)).rows}:require(name),service);
(async()=>{try{
 await client.connect();await client.query('BEGIN READ ONLY');
 const all=await service.auditReport(service.auditFilters({}));
 const counts=(await client.query('SELECT (SELECT count(*) FROM audit_logs)+(SELECT count(*) FROM price_audit) AS count')).rows[0];
 assert.equal(all.length,Number(counts.count));
 const report=service.auditDocument(all,service.auditFilters({}),'QA');assert.equal(report.metrics[0].value,String(all.length));
 const filtered=await service.auditReport(service.auditFilters({from:'2026-10-01',to:'2026-10-23'}));
 assert.ok(filtered.every(e=>e.timestamp.slice(0,10)>='2026-10-01'&&e.timestamp.slice(0,10)<='2026-10-23'));
 await client.query('ROLLBACK');console.log(`Read-only audit QA passed: ${all.length} operational and pricing events reconciled; PKT date filters verified.`);
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await client.end().catch(()=>{});}})();
