// Read-only integration check; prints counts without customer or account details.
require('dotenv').config({path:'.env.local',quiet:true});
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const pg=require('pg');
const assert=require('node:assert/strict');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
async function main(){
 await client.connect();
 await client.query('BEGIN READ ONLY');
 try{
  const mod={exports:{}};
  const source=ts.transpileModule(fs.readFileSync('lib/operations.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let pending=Promise.resolve();
  vm.runInNewContext(source,{exports:mod.exports,require:()=>({query:sql=>{
   const result=pending.then(()=>client.query(sql));
   pending=result.then(()=>undefined);
   return result.then(r=>r.rows);
  }})});
  const result=await mod.exports.operationsData();
  for(const key of ['current','days30','days60','days90','older'])assert.ok(Number.isFinite(Number(result.aging[key])));
  for(const row of result.collections){assert.ok(Number(row.days)>0);assert.ok(Number(row.balance)>0)}
  for(const row of result.expiry)assert.ok(Number(row.days)<=90);
  for(const row of result.reorder)assert.ok(Number(row.suggested)>=0);
  console.log(JSON.stringify({success:true,collections:result.collections.length,reorder:result.reorder.length,expiry:result.expiry.length}));
 }finally{await client.query('ROLLBACK')}
}
main().catch(e=>{console.error('Operations check failed:',e.code||e.message);process.exitCode=1}).finally(()=>client.end());
