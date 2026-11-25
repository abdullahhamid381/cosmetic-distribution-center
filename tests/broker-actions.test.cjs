const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(path,imports={}){const exports={};new Function('require','exports',compile(path))(n=>imports[n]||require(n),exports);return exports;}
const logic=load('lib/sales-team.ts'),utils=load('lib/utils.ts'),shopLogic=load('lib/shop-broker.ts');
function setup({role='ADMIN',status='DELIVERED',fail=false,shopInvoices=[],collected=1000,receiptFail=false}={}){
 const state={paid:0,writes:0,receipts:0,snapshots:[]};
 const tx={query:async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM sales_brokers'))return {rows:[{id:1}]};
  if(sql.startsWith('SELECT o.*,COALESCE'))return {rows:[{status,collected,retail_total:1000,product_cost:500,shipping_charge:0,courier_cost:100,shipping_cost:0,return_cost:0,commission_pct:20,commission_basis:'RETAIL',broker_id:1,broker_pct:10}]};
  if(sql.startsWith('SELECT COALESCE(SUM(amount)'))return {rows:[{paid:state.paid}]};
  if(sql.startsWith('SELECT i.id,i.total,i.paid_total,i.credit_total,i.broker_pct'))return {rows:shopInvoices};
  if(sql.startsWith('SELECT id FROM broker_commission_payouts'))return {rows:[{id:1}]};
  if(sql.startsWith('INSERT INTO broker_payout_receipts')){if(receiptFail)throw new Error('receipt storage failed');state.receipts++;return {rows:[]};}
  if(sql.startsWith('INSERT INTO broker_commission_payouts')){state.paid+=args[1];state.writes++;state.snapshots=[...state.snapshots,args];return {rows:[{id:1}]};}
  if(sql.startsWith('INSERT INTO audit_logs')){if(fail)throw new Error('private db detail');return {rows:[]};}
  throw new Error('Unexpected query');
 }};
 const actions=load('app/broker-actions.ts',{'@/lib/payment-receipts':load('lib/payment-receipts.ts'),'@/lib/broker-payout-receipts':load('lib/broker-payout-receipts.ts'),'@/lib/broker-payment-time':load('lib/broker-payment-time.ts'),'@/lib/auth':{requireRole:async(...roles)=>{if(!roles.includes(role))throw new Error('Forbidden');return {id:5,role};}},'@/lib/utils':utils,'@/lib/sales-team':logic,'@/lib/shop-broker':shopLogic,'@/lib/db':{transaction:async fn=>{const before={...state};try{return await fn(tx);}catch(e){Object.assign(state,before);throw e;}}},'next/cache':{revalidatePath:()=>{}},'next/navigation':{unstable_rethrow:()=>{}}});return {state,actions};
}
function form(values={}){const f=new FormData();for(const [k,v] of Object.entries({broker_id:1,amount:100,method:'BANK',payment_date:'2026-01-01',...values}))f.set(k,String(v));return f;}
test('broker payout uses retail commission and cannot spend the same balance twice',async()=>{
 const {state,actions}=setup();assert.ok((await actions.payBrokerCommission({},form())).success);assert.equal(state.paid,100);assert.match((await actions.payBrokerCommission({},form())).error,/exceeds/);assert.equal(state.paid,100);
});
test('undelivered and returned broker commissions cannot be paid',async()=>{
 for(const status of ['PENDING','DISPATCHED','RETURNED','CANCELLED']){const {state,actions}=setup({status});assert.ok((await actions.payBrokerCommission({},form())).error);assert.equal(state.writes,0);}
});
test('sales portal users cannot create brokers or record broker payouts',async()=>{
 const {state,actions}=setup({role:'SALES'});assert.ok((await actions.payBrokerCommission({},form())).error);assert.ok((await actions.saveBroker({},form())).error);assert.equal(state.writes,0);
});
test('broker payout rolls back if its audit entry fails',async()=>{
 const {state,actions}=setup({fail:true});const result=await actions.payBrokerCommission({},form());assert.ok(result.error);assert.doesNotMatch(result.error,/private/);assert.equal(state.paid,0);assert.equal(state.writes,0);
});
test('sales and shop broker payouts have independent earnings and deductions',async()=>{
 const h=setup({shopInvoices:[{total:800,paid_total:500,credit_total:0,broker_pct:20,retail_net:1000}]});
 assert.ok((await h.actions.payBrokerCommission({},form({amount:100,broker_source:'SALES'}))).success);
 const shop=setup({shopInvoices:[{total:800,paid_total:500,credit_total:0,broker_pct:20,retail_net:1000}]});assert.match((await shop.actions.payBrokerCommission({},form({amount:1,broker_source:'SHOP'}))).error,/exceeds/);
 const settled=setup({shopInvoices:[{total:800,paid_total:800,credit_total:0,broker_pct:20,retail_net:1000}]});assert.ok((await settled.actions.payBrokerCommission({},form({amount:200,broker_source:'SHOP'}))).success);assert.equal(settled.state.paid,200);assert.match((await settled.actions.payBrokerCommission({},form({amount:1,broker_source:'SHOP'}))).error,/exceeds/);
});

 test('pending customer order balance reduces broker profit and blocks payout',async()=>{const h=setup({collected:950});assert.ok((await h.actions.payBrokerCommission({},form({amount:50}))).success);assert.match((await h.actions.payBrokerCommission({},form({amount:1}))).error,/exceeds/);const unpaid=setup({collected:0});assert.match((await unpaid.actions.payBrokerCommission({},form({amount:1}))).error,/exceeds/);assert.equal(unpaid.state.writes,0);});

function pngReceipt(f){f.set('receipt',new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),'bank-slip.png');return f;}
test('payout saves payment time, before/after balance and receipt in the same transaction',async()=>{const h=setup();assert.ok((await h.actions.payBrokerCommission({},pngReceipt(form({amount:40,payment_time:'12:34:56'})))).success);assert.equal(h.state.paid,40);assert.equal(h.state.receipts,1);assert.equal(h.state.snapshots[0][8],'12:34:56');assert.equal(h.state.snapshots[0][9],100);assert.equal(h.state.snapshots[0][10],60);});
test('receipt storage failure rolls back the payment and balances',async()=>{const h=setup({receiptFail:true});assert.ok((await h.actions.payBrokerCommission({},pngReceipt(form()))).error);assert.equal(h.state.paid,0);assert.equal(h.state.writes,0);assert.equal(h.state.receipts,0);});
test('receipt attachment to an existing payout changes no payment amount',async()=>{const h=setup();assert.ok((await h.actions.attachBrokerPayoutReceipt({},pngReceipt(form({payout_id:1})))).success);assert.equal(h.state.receipts,1);assert.equal(h.state.paid,0);assert.equal(h.state.writes,0);});
test('invalid receipt and time show actionable errors without a payout',async()=>{const h=setup(),f=form();f.set('receipt',new Blob(['invalid'],{type:'text/plain'}),'receipt.txt');assert.match((await h.actions.payBrokerCommission({},f)).error,/PDF, JPG, PNG/);assert.match((await h.actions.payBrokerCommission({},form({payment_time:'25:70'}))).error,/valid payment time/);assert.equal(h.state.writes,0);});
