const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function reportModule(respond=()=>[]) {
 const result={exports:{}},calls=[];
 const source=ts.transpileModule(fs.readFileSync('lib/report-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{module:result,exports:result.exports,require:name=>name==='./invoice-discount'?(()=>{const out={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/invoice-discount.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);return out;})():name==='./shop-broker'?(()=>{const out={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/shop-broker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);return out;})():({query:async(sql,args)=>{calls.push({sql,args});return respond(sql,args);}})});
 return {...result.exports,calls};
}
test('rejects impossible dates, reversed ranges, and invalid store IDs',()=>{
 const {reportFilters}=reportModule();
 for(const input of [{from:'2026-02-30'},{from:'2026-10-22',to:'2026-10-21'},{shop:'0'},{shop:'1 OR 1=1'}])assert.ok(reportFilters(input).error);
 assert.equal(reportFilters({shop:'2',from:'2026-10-21',to:'2026-10-21'}).error,'');
 assert.equal(reportFilters({to:'2026-10-21'}).error,'');
});
test('invoice balance reconciles original minus received minus returns',async()=>{
 const h=reportModule(sql=>sql.includes('SELECT i.*')?[{total:'27195.00',paid_total:'10000.00',credit_total:'9065.00',remaining:'8130.00'},{total:'1000.00',paid_total:'200.00',credit_total:'0.00',remaining:'800.00'}]:sql.includes('SELECT p.id,p.name')?[{gross:'9330.00'}]:sql.includes('FROM expenses')?[{id:'7',amount:'300.00',title:'Fuel',category:'Transport',expense_date:'2026-10-20',recorded_by:'Owner'}]:[]);
 const result=await h.businessReport(h.reportFilters({shop:'2',from:'2026-10-01',to:'2026-10-31'}));
 assert.equal(result.totals.original,28195);
 assert.equal(result.totals.received,10200);
 assert.equal(result.totals.returns,9065);
 assert.equal(result.totals.remaining,8930);
 assert.equal(result.totals.original-result.totals.received-result.totals.returns,result.totals.remaining);
 assert.equal(result.gross,9330);
 assert.equal(result.expenses,300);assert.equal(result.expenseDetails[0].recorded_by,'Owner');
 const expenseQuery=h.calls.find(c=>c.sql.includes('FROM expenses'));assert.deepEqual(Array.from(expenseQuery.args),['2026-10-01','2026-10-31']);assert.ok(!expenseQuery.sql.includes('shop_id'));
 assert.ok(h.calls.some(c=>c.sql.includes('i.issue_date >= $2')&&c.sql.includes('i.issue_date <= $3')));
 assert.ok(h.calls.some(c=>c.sql.includes('p.payment_date >= $2')&&c.sql.includes('p.payment_date <= $3')));
 assert.ok(h.calls.some(c=>c.sql.includes("AT TIME ZONE 'Asia/Karachi'")));
 for(const c of h.calls.filter(c=>!c.sql.includes('FROM expenses')))assert.deepEqual(Array.from(c.args),c.sql.includes('$4::bigint')?['2','2026-10-01','2026-10-31',null]:['2','2026-10-01','2026-10-31']);
});
test('invalid report filters do not run database queries',async()=>{
 const h=reportModule();await assert.rejects(h.businessReport(h.reportFilters({from:'invalid'})),/valid From/);assert.equal(h.calls.length,0);
});
test('business profit includes local sale margin and net collections while shop totals stay scoped',async()=>{
 const h=reportModule(sql=>sql.includes('FROM customer_orders o')
  ?[{id:12,sale_date:'2026-11-20',customer_name:'Local customer',status:'DELIVERED',original:'903.60',sales:'903.60',cost:'400.00',received:'500.00'}]:[]);
 const business=await h.businessReport(h.reportFilters({from:'2026-11-01',to:'2026-11-30'}));
 assert.equal(business.profitSales,903.60);
 assert.equal(business.profitPending.toFixed(2),'403.60');
 assert.equal(business.gross.toFixed(2),'503.60');
 assert.equal((business.gross-business.profitPending).toFixed(2),'100.00');
 assert.equal(business.totals.original,0);
 assert.equal(business.localSales[0].id,'12');
 assert.equal(business.localSales[0].customer,'Local customer');
 assert.equal(business.localSales[0].balance.toFixed(2),'403.60');
 const shop=await h.businessReport(h.reportFilters({shop:'1'}));
 assert.equal(shop.profitSales,0);
 assert.equal(shop.localSales.length,0);
 assert.equal(h.calls.filter(call=>call.sql.includes('FROM customer_orders o')).length,1);
});
test('product filter isolates units and costs while preserving full-invoice profit',async()=>{
 const h=reportModule(sql=>sql.includes('SELECT p.id,p.name')?[
  {id:'1',units:'30',returned_units:'10',dispatch_cost:'13200',return_cost:'4400',gross:'9330'},
  {id:'2',units:'5',returned_units:'0',dispatch_cost:'1000',return_cost:'0',gross:'500'},
 ]:sql.includes('FROM expenses')?[]:[]);
 const r=await h.businessReport(h.reportFilters({product:'1'}));
 assert.equal(r.products.length,1);assert.equal(r.productTotals.units,30);assert.equal(r.productTotals.returnedUnits,10);
 assert.equal(r.productTotals.dispatchCost-r.productTotals.returnCost,8800);
 assert.equal(r.gross,9830);
 assert.equal(h.calls.find(c=>c.sql.includes('$4::bigint')).args[3],'1');
 assert.ok(h.reportFilters({product:'-1'}).error);
});

test('broker commission uses selected invoice retail after returns and payment release ratio',async()=>{
 const h=reportModule(sql=>sql.includes('SELECT i.*')?[{id:1,invoice_no:'INV-1',shop_name:'Shop',broker_id:9,broker_pct:20,broker_name:'Broker',total:800,paid_total:400,credit_total:0,remaining:400,retail_net:1000},{id:2,total:800,paid_total:0,credit_total:0,remaining:800,retail_net:1000,broker_id:null}]:[]);
 const r=await h.businessReport(h.reportFilters({shop:'2',from:'2026-10-01',to:'2026-10-31'}));
 assert.equal(r.brokerDetails.length,1);assert.equal(r.brokerDetails[0].broker_pct,20);assert.equal(r.brokerCommission.allocation,200);assert.equal(r.brokerCommission.earned,100);
 const sql=h.calls.find(c=>c.sql.includes('SELECT i.*')).sql;assert.match(sql,/ii.quantity-COALESCE\(r.qty,0\)/);assert.match(sql,/i.issue_date >= \$2/);
});

test('report percentages use saved product rates and clearly distinguish mixed invoices',async()=>{
 const h=reportModule(sql=>sql.includes('SELECT i.*')?[
  {total:800,subtotal:1000,discount_total:200,paid_total:0,credit_total:0,remaining:800,shop_pct_min:'20',shop_pct_max:'20'},
  {total:1500,subtotal:2000,discount_total:500,paid_total:0,credit_total:0,remaining:1500,shop_pct_min:'20',shop_pct_max:'30'}
 ]:[]);
 const r=await h.businessReport(h.reportFilters({}));assert.equal(r.invoices[0].shop_discount_percentage,'20.00%');assert.equal(r.invoices[1].shop_discount_percentage,'25.00% overall');
 assert.ok(h.calls.some(c=>c.sql.includes('ii.quantity AS units,ii.discount_pct')));
});
