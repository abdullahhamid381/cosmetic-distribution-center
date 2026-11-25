const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const utils={};new Function('require','exports',compile('lib/utils.ts'))(require,utils);
const actionCode=compile('app/actions.ts');

function setup({cost='100.00',manufacture=null,expiry=null,fail=false}={}){
 const state={quantity:12,movements:0,audits:0,rolledBack:false};
 const tx={query:async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM'))return {rows:[{id:1}]};
  if(sql.startsWith('INSERT INTO batches'))return {rows:[{id:1,unit_cost:cost,manufacture_date:manufacture,expiry_date:expiry}]};
  if(sql.startsWith('UPDATE batches')){state.quantity+=args[0];return {rows:[]};}
  if(sql.includes('INSERT INTO stock_movements')){if(fail)throw new Error('private database failure');state.movements++;return {rows:[]};}
  if(sql.startsWith('INSERT INTO public.audit_logs')){state.audits++;return {rows:[]};}
  throw new Error('Unexpected query');
 }};
 const db={transaction:async fn=>{const before={...state};try{return await fn(tx);}catch(e){Object.assign(state,before,{rolledBack:true});throw e;}}};
 const actions={};
 new Function('require','exports',actionCode)(name=>{
  if(name==='@/lib/utils')return utils;
  if(name==='@/lib/db')return db;
  if(name==='@/lib/auth')return {requireRole:async()=>({id:7})};
  if(name==='next/cache')return {revalidatePath:()=>{}};
  if(name==='next/navigation')return {redirect:path=>{const error=new Error('REDIRECT');error.path=path;throw error;}};
  if(name.startsWith('@/'))return {};
  return require(name);
 },actions);
 return {state,actions};
}
function form(overrides={}){const fd=new FormData();for(const [key,value] of Object.entries({product_id:'1',warehouse_id:'1',quantity:'5',batch_number:'BATCH-001',unit_cost:'100.00',...overrides}))fd.set(key,value);return fd;}

test('cost conflict returns a useful message and rolls back the receipt',async()=>{
 const {actions,state}=setup();const result=await actions.receiveStock(form({unit_cost:'125'}));
 assert.match(result.error,/100\.00/);assert.match(result.error,/125\.00/);assert.match(result.error,/different batch reference/);
 assert.equal(state.quantity,12);assert.equal(state.movements,0);assert.equal(state.audits,0);assert.equal(state.rolledBack,true);
});
test('matching repeat receipt updates quantity, movement and audit, then redirects',async()=>{
 const {actions,state}=setup();await assert.rejects(actions.receiveStock(form()),e=>e.path==='/inventory?received=1');
 assert.equal(state.quantity,17);assert.equal(state.movements,1);assert.equal(state.audits,1);
});
test('manufacturing and expiry conflicts return field guidance without stock changes',async()=>{
 for(const [field,options] of [['manufacture_date',{manufacture:'2026-01-01'}],['expiry_date',{expiry:'2027-01-01'}]]){
  const {actions,state}=setup(options);const result=await actions.receiveStock(form({[field]:'2026-06-01'}));
  assert.match(result.error,/date/);assert.equal(state.quantity,12);assert.equal(state.movements,0);
 }
});
test('invalid quantity and date ordering return form errors before a transaction',async()=>{
 for(const input of [{quantity:'0'},{manufacture_date:'2027-01-01',expiry_date:'2026-01-01'}]){
  const {actions,state}=setup();assert.ok((await actions.receiveStock(form(input))).error);assert.equal(state.rolledBack,false);assert.equal(state.quantity,12);
 }
});
test('database failures roll back stock changes and return a safe error',async()=>{
 const {actions,state}=setup({fail:true});const result=await actions.receiveStock(form());
 assert.match(result.error,/No stock changes were saved/);assert.doesNotMatch(result.error,/private database/);assert.equal(state.quantity,12);assert.equal(state.rolledBack,true);
});
