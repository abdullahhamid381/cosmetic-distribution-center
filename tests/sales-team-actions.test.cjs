const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const utils={},logic={};
new Function('require','exports',compile('lib/utils.ts'))(require,utils);
new Function('require','exports',compile('lib/sales-team.ts'))(require,logic);
function setup({status='PENDING',stock=10,failMovement=false,role='MANAGER'}={}){
 const state={status,stock,movements:0,history:0,commission:0,broker:null,brokerPct:10,basis:'PROFIT'};
 const tx={query:async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM customer_orders'))return {rows:[{id:1,status:state.status,commission_pct:state.commission,broker_id:state.broker,broker_pct:state.brokerPct,commission_basis:state.basis}]};
  if(sql.startsWith('SELECT id FROM sales_brokers'))return {rows:Number(args[0])===2?[{id:2}]:[]};
  if(sql.startsWith('SELECT * FROM customer_order_items'))return {rows:[{batch_id:1,quantity:3}]};
  if(sql.startsWith('SELECT b.*'))return {rows:[{id:1,quantity_on_hand:state.stock,product_id:1,warehouse_id:1,dispatchable:true}]};
  if(sql.startsWith('UPDATE batches')){state.stock+=args[0];return {rows:[]};}
  if(sql.includes('INSERT INTO stock_movements')){if(failMovement)throw new Error('movement failed');state.movements++;return {rows:[]};}
  if(sql.startsWith('UPDATE customer_orders SET email')){state.commission=args[8];state.broker=args[9];state.brokerPct=args[10];state.basis=args[11];return {rows:[]};}
  if(sql.startsWith('UPDATE customer_orders')){state.status=args[6];return {rows:[]};}
  if(sql.startsWith('INSERT INTO customer_order_history')){state.history++;return {rows:[]};}
  if(sql.startsWith('INSERT INTO audit_logs'))return {rows:[]};
  throw new Error('Unexpected query: '+sql);
 }};
 const actions={};
 new Function('require','exports',compile('app/sales-team-actions.ts'))(name=>{
  if(name==='@/lib/utils')return utils;
  if(name==='@/lib/sales-team')return logic;
  if(name==='@/lib/auth')return {requireRole:async(...roles)=>{if(!roles.includes(role))throw new Error('Forbidden');return {id:5,role};}};
  if(name==='@/lib/db')return {transaction:async fn=>{const before={...state};try{return await fn(tx);}catch(e){Object.assign(state,before);throw e;}}};
  if(name==='next/cache')return {revalidatePath:()=>{}};
  if(name==='next/navigation')return {redirect:path=>{throw Object.assign(new Error('redirect'),{path});},unstable_rethrow:error=>{if(error.path)throw error;}};
  throw new Error('Unknown import '+name);
 },actions);
 return {state,actions};
}
function form(status,overrides={}){const f=new FormData();for(const [k,v] of Object.entries({order_id:'1',customer_name:'Customer',phone:'03001234567',address:'House 1',city:'Lahore',status,status_note:'Customer status confirmed',courier_name:'Courier',tracking_number:'TRACK-1',shipping_charge:'100',courier_cost:'80',shipping_cost:'0',return_cost:'0',...overrides}))f.set(k,v);return f;}
const saved=e=>e.path==='/sales-team/1';
test('dispatch deducts once; repeated dispatch edits do not deduct again',async()=>{
 const {state,actions}=setup();
 await assert.rejects(actions.updateCustomerOrder(form('DISPATCHED')),saved);
 assert.equal(state.stock,7);assert.equal(state.movements,1);
 await assert.rejects(actions.updateCustomerOrder(form('DISPATCHED')),saved);
 assert.equal(state.stock,7);assert.equal(state.movements,1);
});
test('delivered return restores once; editing returned costs does not restore again',async()=>{
 const {state,actions}=setup({status:'DELIVERED',stock:7});
 await assert.rejects(actions.updateCustomerOrder(form('RETURNED')),saved);
 assert.equal(state.stock,10);
 await assert.rejects(actions.updateCustomerOrder(form('RETURNED',{return_cost:'100'})),saved);
 assert.equal(state.stock,10);assert.equal(state.movements,1);
});
test('insufficient stock and failed movement roll back the complete dispatch',async()=>{
 for(const opts of [{stock:2},{failMovement:true}]){
  const {state,actions}=setup(opts);const before={...state};
  await assert.rejects(actions.updateCustomerOrder(form('DISPATCHED')));
  assert.deepEqual(state,before);
 }
});
test('courier and tracking are mandatory before dispatch',async()=>{
 const {state,actions}=setup();
 await assert.rejects(actions.updateCustomerOrder(form('DISPATCHED',{tracking_number:''})),/tracking/);
 assert.equal(state.stock,10);assert.equal(state.status,'PENDING');
});
test('sales agents cannot process orders and pending orders cannot skip dispatch',async()=>{
 await assert.rejects(setup({role:'SALES'}).actions.updateCustomerOrder(form('DISPATCHED')),/Forbidden/);
 await assert.rejects(setup().actions.updateCustomerOrder(form('DELIVERED')),/not allowed/);
});
test('returns and cancellations require a reason before inventory changes',async()=>{
 for(const status of ['RETURNED','CANCELLED']){
  const {state,actions}=setup({status:status==='RETURNED'?'DELIVERED':'PENDING'});
  const before={...state};await assert.rejects(actions.updateCustomerOrder(form(status,{status_note:''})),/reason/);assert.deepEqual(state,before);
 }
});
test('manager can save an order percentage and invalid percentages cannot change stock or financials',async()=>{
 const {state,actions}=setup();await assert.rejects(actions.updateCustomerOrder(form('PENDING',{commission_pct:'20'})),saved);assert.equal(state.commission,20);
 const before={...state};await assert.rejects(actions.updateCustomerOrder(form('DISPATCHED',{commission_pct:'101'})),/between 0 and 100/);assert.deepEqual(state,before);
});
test('manager assigns a broker per order; unknown brokers and combined rates above 100% roll back',async()=>{
 const {state,actions}=setup();await assert.rejects(actions.updateCustomerOrder(form('PENDING',{commission_pct:20,broker_id:2,broker_pct:10,commission_basis:'RETAIL'})),saved);
 assert.equal(state.broker,2);assert.equal(state.brokerPct,10);assert.equal(state.basis,'RETAIL');
 const before={...state};await assert.rejects(actions.updateCustomerOrder(form('PENDING',{broker_id:999})),/active broker/);assert.deepEqual(state,before);
 await assert.rejects(actions.updateCustomerOrder(form('PENDING',{commission_pct:95,broker_id:2,broker_pct:10})),/cannot exceed/);assert.deepEqual(state,before);
});
test('order form save returns visible success with the persisted status rather than an unnoticeable same-page redirect',async()=>{
 const {state,actions}=setup();const result=await actions.processCustomerOrder({},form('PENDING',{commission_pct:20,broker_id:2,broker_pct:10,commission_basis:'RETAIL'}));
 assert.match(result.success,/saved successfully/);assert.match(result.success,/Current status: PENDING/);assert.equal(state.commission,20);assert.equal(state.broker,2);assert.equal(state.history,1);
 const dispatched=await actions.processCustomerOrder({},form('DISPATCHED'));assert.match(dispatched.success,/Current status: DISPATCHED/);assert.equal(state.stock,7);
});
test('order form save returns a clear validation error without changing the saved record',async()=>{
 const {state,actions}=setup();const before={...state};const result=await actions.processCustomerOrder({},form('DISPATCHED',{tracking_number:''}));assert.match(result.error,/tracking number/);assert.deepEqual(state,before);
});
