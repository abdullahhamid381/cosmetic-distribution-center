const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sales-team.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports});
const {orderFinancials,canTransition,orderProfitPreview}=mod.exports;
const order={status:'DELIVERED',retail_total:'2000',product_cost:'1000',shipping_charge:'200',courier_cost:'150',shipping_cost:'50',return_cost:'0',commission_pct:'25'};
test('commission uses retail profit after product and separate delivery costs',()=>{
 const f=orderFinancials(order);
 assert.equal(f.profit,1000);assert.equal(f.commission,250);assert.equal(f.net,750);
});
test('pending and dispatched orders recognize neither profit nor commission',()=>{
 for(const status of ['PENDING','DISPATCHED']){const f=orderFinancials({...order,status});assert.equal(f.profit,0);assert.equal(f.commission,0);assert.equal(f.projected,1000);}
});
test('returns reverse sales and commission and charge delivery costs to the sales agent',()=>{
 const f=orderFinancials({...order,status:'RETURNED',return_cost:'100'});
 assert.equal(f.profit,-300);assert.equal(f.commission,0);assert.equal(f.agentReturnDeduction,300);assert.equal(f.netCommission,-300);assert.equal(f.net,0);
 assert.equal(orderFinancials({...order,status:'CANCELLED'}).profit,-200);
});
test('loss-making sales never pay negative commission and round to paisa',()=>{
 assert.equal(orderFinancials({...order,product_cost:'3000'}).commission,0);
 const f=orderFinancials({...order,retail_total:'1000.01',product_cost:'1000',shipping_charge:'0',courier_cost:'0',shipping_cost:'0',commission_pct:'50'});
 assert.equal(f.profit,0.01);assert.equal(f.commission,0.01);assert.equal(f.net,0);
});
test('status flow prevents skipping dispatch or reopening stock-moving terminal states',()=>{
 assert.equal(canTransition('PENDING','DELIVERED'),false);
 assert.equal(canTransition('PENDING','DISPATCHED'),true);
 assert.equal(canTransition('DISPATCHED','DELIVERED'),true);
 assert.equal(canTransition('DELIVERED','RETURNED'),true);
 assert.equal(canTransition('DISPATCHED','CANCELLED'),false);
 assert.equal(canTransition('RETURNED','DISPATCHED'),false);
 assert.equal(canTransition('CANCELLED','PENDING'),false);
 assert.equal(canTransition('RETURNED','RETURNED'),true);
});
test('dispatched profit preview splits remaining profit after courier and packing costs',()=>{
 const input={...order,status:'DISPATCHED',courier_cost:'280',shipping_cost:'20'};
 const p=orderProfitPreview(input);
 assert.equal(p.estimated,true);assert.equal(p.revenue,2200);assert.equal(p.totalCosts,1300);assert.equal(p.profit,900);assert.equal(p.agentProfit,225);assert.equal(p.netProfit,675);
 assert.equal(orderFinancials(input).commission,0);
 const delivered=orderProfitPreview({...input,status:'DELIVERED'});assert.equal(delivered.estimated,false);assert.equal(delivered.agentProfit,orderFinancials({...input,status:'DELIVERED'}).commission);
});
test('preview keeps sale losses with the business and assigns returned-package costs to the agent',()=>{
 const loss=orderProfitPreview({...order,status:'PENDING',product_cost:'3000'});assert.equal(loss.profit,-1000);assert.equal(loss.agentProfit,0);assert.equal(loss.netProfit,-1000);
 const returned=orderProfitPreview({...order,status:'RETURNED',return_cost:'100'});assert.equal(returned.revenue,0);assert.equal(returned.productCost,0);assert.equal(returned.totalCosts,300);assert.equal(returned.agentProfit,-300);assert.equal(returned.agentReturnDeduction,300);assert.equal(returned.netProfit,0);
});
test('retail rule pays sales 20% and the selected broker 10% before computing owner net',()=>{
 const input={...order,status:'DELIVERED',retail_total:'1295',product_cost:'430',shipping_charge:0,courier_cost:280,shipping_cost:0,commission_pct:20,commission_basis:'RETAIL',broker_id:'3',broker_pct:10};
 const f=orderFinancials(input);assert.equal(f.profit,585);assert.equal(f.commission,259);assert.equal(f.brokerCommission,129.5);assert.equal(f.totalCommission,388.5);assert.equal(f.net,196.5);
 const p=orderProfitPreview({...input,status:'DISPATCHED'});assert.equal(p.agentProfit,259);assert.equal(p.brokerProfit,129.5);assert.equal(p.netProfit,196.5);assert.equal(p.estimated,true);
});
test('retail commissions exclude shipping, do not depend on margin, and require a selected broker',()=>{
 const input={...order,status:'DELIVERED',retail_total:1000,product_cost:1200,shipping_charge:500,courier_cost:0,shipping_cost:0,commission_pct:20,commission_basis:'RETAIL',broker_pct:10};
 const none=orderFinancials(input);assert.equal(none.commission,200);assert.equal(none.brokerCommission,0);assert.equal(none.net,100);
 const selected=orderFinancials({...input,broker_id:'2'});assert.equal(selected.brokerCommission,100);assert.equal(selected.net,0);
 const loss=orderFinancials({...input,shipping_charge:0,broker_id:'2'});assert.equal(loss.commission,200);assert.equal(loss.brokerCommission,100);assert.equal(loss.net,-500);
});
test('both retail commissions reverse on returned and cancelled orders',()=>{
 for(const status of ['RETURNED','CANCELLED']){const f=orderFinancials({...order,status,commission_basis:'RETAIL',broker_id:1,broker_pct:10,return_cost:100});assert.equal(f.commission,0);assert.equal(f.brokerCommission,0);assert.equal(f.net,status==='RETURNED'?0:-300);assert.equal(f.agentReturnDeduction,status==='RETURNED'?300:0);}
});
