const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const logic={},department={};new Function('require','exports',compile('lib/sales-team.ts'))(require,logic);
new Function('require','exports',compile('lib/sales-department.ts'))(n=>n==='./sales-team'?logic:require(n),department);
const order={id:'1',agent_id:'1',status:'DELIVERED',retail_total:'1000',product_cost:'400',shipping_charge:'100',courier_cost:'80',shipping_cost:'20',return_cost:'0',commission_pct:'20',collected:'500',created_date:'2026-09-25',delivered_date:'2026-10-02',customer_name:'Customer',phone:'03001234567',agent_name:'Agent',priority:'NORMAL',city:'Lahore'};
test('customer payments use billed total, with refundable balance after return',()=>{
 assert.deepEqual(logic.paymentBalance(order),{billed:1100,collected:500,due:600,refundDue:0});
 assert.deepEqual(logic.paymentBalance({...order,status:'RETURNED'}),{billed:0,collected:500,due:0,refundDue:500});
 assert.equal(logic.paymentBalance({...order,collected:'1200'}).refundDue,100);
});
test('commission already paid becomes recovery after a returned order',()=>{
 let p=department.agentPerformance([order],'1',120,'2026-10');assert.equal(p.earned,120);assert.equal(p.due,0);assert.equal(p.recovery,0);
 p=department.agentPerformance([{...order,status:'RETURNED'}],'1',120,'2026-10');assert.equal(p.returnDeductions,100);assert.equal(p.recovery,220);assert.equal(p.due,0);assert.equal(p.delivered,0);
});
test('targets use delivery month; report cohorts use creation date',()=>{
 assert.equal(department.agentPerformance([order],'1',0,'2026-10').retail,1000);
 assert.equal(department.agentPerformance([order],'1',0,'2026-09').retail,0);
 assert.equal(department.filterDepartmentOrders([order],{from:'2026-09-01',to:'2026-09-30'}).length,1);
 assert.equal(department.filterDepartmentOrders([order],{from:'2026-10-01'}).length,0);
});
test('order filters combine agent, status, search and priority without broadening scope',()=>{
 const rows=[order,{...order,id:'2',agent_id:'2',priority:'URGENT'}];
 assert.equal(department.filterDepartmentOrders(rows,{agent:'2',priority:'URGENT',q:'lahore',status:'DELIVERED'}).length,1);
 assert.equal(department.filterDepartmentOrders(rows,{agent:'1',priority:'URGENT'}).length,0);
 assert.throws(()=>department.filterDepartmentOrders(rows,{from:'2026-10-10',to:'2026-10-01'}));
 for(const date of ['2026-02-30','bad','2026-13-01'])assert.throws(()=>logic.validDate(date));
});
test('department totals reconcile retail profit and cash without counting payouts twice',()=>{
 const t=department.departmentTotals([order,{...order,id:'2',status:'RETURNED',collected:'100',return_cost:'50'}]);
 assert.equal(t.retail,1000);assert.equal(t.profit,450);assert.equal(t.commission,120);assert.equal(t.returnDeductions,150);assert.equal(t.net,480);assert.equal(t.collected,600);assert.equal(t.due,600);assert.equal(t.refundDue,100);
});
test('CSV escapes formulas, quotes and customer line breaks',()=>{
 assert.equal(department.csvCell('=1+1'),'"\'=1+1"');
 assert.equal(department.csvCell('a"b\nc'),'"a""b\nc"');
 assert.equal(department.csvCell('  @SUM(A1)'),'"\'  @SUM(A1)"');
});
test('agent sees expected retail commission on dispatched orders while earned and payable balances stay zero',()=>{
 const dispatched={...order,status:'DISPATCHED',commission_basis:'RETAIL',retail_total:1295,commission_pct:20};
 const p=department.agentPerformance([dispatched,{...dispatched,id:'2',agent_id:'2'}],'1',0,'2026-10');
 assert.equal(p.expected,259);assert.equal(p.earned,0);assert.equal(p.due,0);
 const delivered=department.agentPerformance([{...dispatched,status:'DELIVERED'}],'1',0,'2026-10');
 assert.equal(delivered.expected,0);assert.equal(delivered.earned,259);assert.equal(delivered.due,259);
 for(const status of ['RETURNED','CANCELLED'])assert.equal(department.agentPerformance([{...dispatched,status}],'1',0,'2026-10').expected,0);
});
test('returned charges offset earned commission and unpaid dues carry forward into future delivered earnings only',()=>{
 const returned={...order,id:'2',status:'RETURNED',courier_cost:280,shipping_cost:20,return_cost:100,shipping_charge:999,commission_basis:'RETAIL'};
 let p=department.agentPerformance([{...order,commission_basis:'RETAIL'},returned],'1',0,'2026-10');
 assert.equal(p.earned,200);assert.equal(p.returnDeductions,400);assert.equal(p.netEarned,-200);assert.equal(p.due,0);assert.equal(p.recovery,200);
 p=department.agentPerformance([{...order,commission_basis:'RETAIL'},returned,{...order,id:'3',status:'DISPATCHED',commission_basis:'RETAIL',retail_total:2000}],'1',0,'2026-10');assert.equal(p.recovery,200);assert.equal(p.expected,400);
 p=department.agentPerformance([{...order,commission_basis:'RETAIL'},returned,{...order,id:'3',commission_basis:'RETAIL',retail_total:2000}],'1',0,'2026-10');assert.equal(p.due,200);assert.equal(p.recovery,0);
 assert.equal(department.agentPerformance([returned],'1',0,'2026-10').returnDeductions,400);
 assert.equal(department.agentPerformance([returned],'1',0,'2026-10').returnDeductions,400);
 assert.equal(department.agentPerformance([{...returned,return_cost:200}],'1',0,'2026-10').returnDeductions,500);
 const other=department.agentPerformance([{...returned,agent_id:'2'}],'1',0,'2026-10');assert.equal(other.returnDeductions,0);
});
