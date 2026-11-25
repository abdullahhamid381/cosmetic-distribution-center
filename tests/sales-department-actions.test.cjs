const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const utils={},logic={};new Function('require','exports',compile('lib/utils.ts'))(require,utils);new Function('require','exports',compile('lib/sales-team.ts'))(require,logic);
function setup({role='ACCOUNTS',status='DELIVERED',paid=0,collected=0,fail=false,returnCharges=0}={}){
 const state={paid,collected,writes:0};
 const order={id:1,agent_id:1,user_id:10,status,retail_total:'1000',product_cost:'400',shipping_charge:'100',courier_cost:'80',shipping_cost:'20',return_cost:'0',commission_pct:'20'};
 const tx={query:async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM sales_agents'))return {rows:[{id:1}]};
  if(sql.startsWith('SELECT o.*,a.user_id'))return {rows:[order]};
  if(sql.startsWith('SELECT o.*,COALESCE'))return {rows:[order,...(returnCharges?[{...order,id:2,status:'RETURNED',courier_cost:returnCharges,shipping_cost:0,return_cost:0}]:[])]};
  if(sql.startsWith('SELECT COALESCE(SUM(amount)'))return {rows:[{paid:state.paid}]};
  if(sql.startsWith('SELECT COALESCE((SELECT SUM(quantity'))return {rows:[{retail_total:1000,collected:state.collected}]};
  if(sql.startsWith('INSERT INTO sales_commission_payouts')){state.paid+=args[1];state.writes++;return {rows:[{id:1}]};}
  if(sql.startsWith('INSERT INTO customer_order_payments')){state.collected+=args[1]==='COLLECTION'?args[2]:-args[2];state.writes++;return {rows:[{id:1}]};}
  if(sql.startsWith('INSERT INTO audit_logs')){if(fail)throw new Error('database secret');return {rows:[]};}
  throw new Error('Unhandled query: '+sql);
 }};
 const actions={};new Function('require','exports',compile('app/sales-department-actions.ts'))(n=>{
  if(n==='@/lib/auth')return {requireRole:async(...roles)=>{if(!roles.includes(role))throw new Error('Forbidden');return {id:5,role};}};
  if(n==='@/lib/utils')return utils;if(n==='@/lib/sales-team')return logic;
  if(n==='@/lib/db')return {transaction:async fn=>{const before={...state};try{return await fn(tx);}catch(e){Object.assign(state,before);throw e;}}};
  if(n==='next/cache')return {revalidatePath:()=>{}};
  if(n==='next/navigation')return {unstable_rethrow:()=>{}};
  throw new Error('Unexpected import '+n);
 },actions);return {state,actions};
}
function form(values={}){const f=new FormData();for(const [k,v] of Object.entries({agent_id:'1',order_id:'1',amount:'100',kind:'COLLECTION',method:'BANK',payment_date:'2026-01-01',...values}))f.set(k,v);return f;}
test('payouts cannot exceed earned commission or pay the same available balance twice',async()=>{
 const {state,actions}=setup();assert.ok((await actions.recordCommissionPayout({},form())).success);assert.equal(state.paid,100);
 assert.match((await actions.recordCommissionPayout({},form())).error,/exceeds/);assert.equal(state.paid,100);
});
test('returned order commissions cannot be paid',async()=>{
 const {state,actions}=setup({status:'RETURNED'});assert.match((await actions.recordCommissionPayout({},form())).error,/exceeds/);assert.equal(state.writes,0);
});
test('collections are capped at remaining due and refunds at actual refundable payments',async()=>{
 let x=setup({collected:1050});assert.match((await x.actions.recordCustomerPayment({},form())).error,/exceeds/);assert.equal(x.state.collected,1050);
 x=setup({status:'RETURNED',collected:100});assert.ok((await x.actions.recordCustomerPayment({},form({kind:'REFUND'}))).success);assert.equal(x.state.collected,0);
 assert.match((await x.actions.recordCustomerPayment({},form({kind:'REFUND'}))).error,/exceeds/);
});
test('financial writes roll back when audit fails and hide database messages',async()=>{
 const {state,actions}=setup({fail:true});const result=await actions.recordCustomerPayment({},form());assert.match(result.error,/Could not save/);assert.doesNotMatch(result.error,/secret/);assert.equal(state.collected,0);assert.equal(state.writes,0);
});
test('agents cannot record customer collections or commission payouts',async()=>{
 const {state,actions}=setup({role:'SALES'});assert.ok((await actions.recordCustomerPayment({},form())).error);assert.ok((await actions.recordCommissionPayout({},form())).error);assert.equal(state.writes,0);
});
test('agents cannot schedule follow-ups on another agent’s order',async()=>{
 const {actions}=setup({role:'SALES'});assert.match((await actions.addSalesFollowup({},form({due_date:'2026-11-01',note:'Customer call'}))).error,/unavailable/);
});
test('impossible dates and future payments are rejected before writing',async()=>{
 const {state,actions}=setup();assert.ok((await actions.recordCustomerPayment({},form({payment_date:'2026-02-30'}))).error);assert.ok((await actions.recordCustomerPayment({},form({payment_date:'2099-01-01'}))).error);assert.equal(state.writes,0);
});
test('sales commission payouts are capped after returned-package costs and prior payments',async()=>{
 const {state,actions}=setup({returnCharges:80});assert.match((await actions.recordCommissionPayout({},form({amount:50}))).error,/exceeds/);assert.equal(state.paid,0);
 assert.ok((await actions.recordCommissionPayout({},form({amount:40}))).success);assert.equal(state.paid,40);
 assert.match((await actions.recordCommissionPayout({},form({amount:1}))).error,/exceeds/);assert.equal(state.paid,40);
 const owed=setup({returnCharges:200});assert.ok((await owed.actions.recordCommissionPayout({},form({amount:1}))).error);assert.equal(owed.state.paid,0);
});
