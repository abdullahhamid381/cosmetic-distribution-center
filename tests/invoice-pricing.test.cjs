const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,dependencies={}) {
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,require:name=>dependencies[name]??require(name),FormData,console});
 return mod.exports;
}
function harness() {
 const calls=[];
 const db={transaction:async fn=>fn({query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT * FROM shops'))return {rows:[{id:1,default_discount:10,credit_limit:0,payment_terms_days:30}]};
  if(sql.startsWith('SELECT id FROM sales_brokers'))return {rows:[{id:args[0]}]};
  if(sql.includes('FROM batches b JOIN products'))return {rows:[{id:2,product_id:1,warehouse_id:1,quantity_on_hand:100,retail_price:'1295.00',trade_price:'500.00',custom_pct:20,unit_cost:'440.00',manufacturer_price:'430.00',box_cost:'20.00',is_expired:false}]};
  if(sql.includes('AS due FROM invoices'))return {rows:[{due:0}]};
  if(sql.startsWith('INSERT INTO deliveries'))return {rows:[{id:3}]};
  if(sql.startsWith('INSERT INTO invoices'))return {rows:[{id:4}]};
  if(sql.startsWith('SELECT store_code FROM shops'))return {rows:[{store_code:'SHP-000001'}]};
  if(sql.startsWith('INSERT INTO products'))return {rows:[{id:5}]};
  return {rows:[]};
 }})};
 const actions=load('app/actions.ts',{
  'next/navigation':{unstable_rethrow:e=>{if(e.location)throw e;},redirect:location=>{throw Object.assign(new Error('redirect'),{location});}},
  'next/cache':{revalidatePath:()=>{}},
  '@/lib/db':db,'@/lib/auth':{requireRole:async()=>({id:1,role:'ADMIN'})},
  '@/lib/dispatch-cost':load('lib/dispatch-cost.ts'),'@/lib/utils':load('lib/utils.ts'),'@/lib/product-pricing':load('lib/product-pricing.ts'),
  '@/lib/payment-receipts':{},
  '@/lib/store-invoice-number':load('lib/store-invoice-number.ts'),
  '@/lib/invoice-dates':load('lib/invoice-dates.ts'),
  '@/lib/closing-period':{'pakistanToday':()=> '2026-11-18'},
  '@/lib/sales-team':load('lib/sales-team.ts'),
 });return {actions,calls};
}
function saleForm(pct,rows) {
 const f=new FormData();for(const [k,v] of Object.entries({shop_id:'1',warehouse_id:'1',lines:JSON.stringify(rows||[{batchId:2,quantity:30,...(pct===undefined?{}:{discountPct:pct})}])}))f.set(k,v);return f;
}

test('product percentage sets both trade and charged price, ignoring legacy overrides',async()=>{
 const h=harness();await assert.rejects(h.actions.createSale(saleForm(40)),e=>e.location==='/invoices/4');
 const line=h.calls.find(c=>c.sql.startsWith('INSERT INTO invoice_items'));
 assert.equal(line.args[4],'1295.00');assert.equal(line.args[5],'777.00');assert.equal(line.args[6],40);assert.equal(line.args[7],'777.00');assert.equal(line.args[9],'23310.00');
 assert.equal(h.calls.some(c=>c.sql.includes('LEFT JOIN shop_product_rates')),false);
});

test('each product percentage is required and must be within 0 to 100',async()=>{
 for(const pct of [undefined,-1,101,'invalid',null]){const h=harness();await assert.rejects(h.actions.createSale(saleForm(pct)));assert.equal(h.calls.length,0);}
});

test('dispatch applies the second discount to the discounted price and saves both rates',async()=>{
 const h=harness();
 const form=saleForm(null,[{batchId:2,quantity:2,discountPct:20,secondDiscountPct:10}]);
 await assert.rejects(h.actions.createSale(form),e=>e.location==='/invoices/4');
 const line=h.calls.find(c=>c.sql.startsWith('INSERT INTO invoice_items'));
 assert.equal(line.args[6],28);
 assert.equal(line.args[7],'932.40');
 assert.equal(line.args[9],'1864.80');
 assert.deepEqual(Array.from(line.args.slice(15)),[20,10]);
});

test('different percentages create separate price snapshots for the same batch',async()=>{
 const h=harness();await assert.rejects(h.actions.createSale(saleForm(null,[{batchId:2,quantity:2,discountPct:40},{batchId:2,quantity:3,discountPct:30}])),e=>e.location==='/invoices/4');
 const lines=h.calls.filter(c=>c.sql.startsWith('INSERT INTO invoice_items'));
 assert.equal(lines.length,2);assert.equal(lines[0].args[6],40);assert.equal(lines[0].args[9],'1554.00');assert.equal(lines[1].args[6],30);assert.equal(lines[1].args[9],'2719.50');
 const invoice=h.calls.find(c=>c.sql.startsWith('INSERT INTO invoices'));
 assert.equal(invoice.args[3],'2026-12-10');assert.equal(invoice.args[4],'6475.00');assert.equal(invoice.args[5],'2201.50');assert.equal(invoice.args[6],'4273.50');
});

test('repeated batch rows cannot bypass the combined stock check',async()=>{
 const h=harness();await assert.rejects(h.actions.createSale(saleForm(null,[{batchId:2,quantity:60,discountPct:40},{batchId:2,quantity:60,discountPct:30}])),/Not enough stock/);
 assert.equal(h.calls.some(c=>c.sql.startsWith('INSERT INTO invoices')),false);
});

test('zero discount charges retail and 100 percent discount charges zero',async()=>{
 for(const [discountPct,expected] of [[0,'1295.00'],[100,'0.00']]){
 const h=harness();await assert.rejects(h.actions.createSale(saleForm(null,[{batchId:2,quantity:1,discountPct}])),e=>e.location==='/invoices/4');
 assert.equal(h.calls.find(c=>c.sql.startsWith('INSERT INTO invoice_items')).args[7],expected);
 }
});

test('product creation needs manufacturing and retail prices only',async()=>{
 const h=harness(),f=new FormData();for(const [key,value] of Object.entries({sku:'FW',name:'Facewash',manufacturer_price:'440',retail_price:'1295'}))f.set(key,value);
 await assert.rejects(h.actions.createProduct(f),e=>e.location==='/products?created=5');
 const insert=h.calls.find(c=>c.sql.startsWith('INSERT INTO products'));
 assert.equal(insert.args[5],440);assert.equal(insert.args[8],1295);
});
test('shop 20 plus broker 20 snapshots private 40 percent while customer line stays at shop 20',async()=>{
 const h=harness(),f=saleForm(20,[{batchId:2,quantity:1,discountPct:20}]);f.set('broker_id','9');f.set('broker_pct','20');
 await assert.rejects(h.actions.createSale(f),e=>e.location==='/invoices/4');const line=h.calls.find(c=>c.sql.startsWith('INSERT INTO invoice_items'));
 assert.equal(line.args[6],20);assert.equal(line.args[7],'1036.00');assert.equal(line.args[9],'1036.00');assert.equal(line.args[10],20);assert.equal(line.args[11],'777.00');
 const invoice=h.calls.find(c=>c.sql.startsWith('INSERT INTO invoices'));assert.equal(invoice.args[5],'259.00');assert.equal(invoice.args[6],'1036.00');
 assert.ok(h.calls.some(c=>c.sql.startsWith('UPDATE invoices SET broker_id')&&c.args[0]===9&&c.args[1]===20));
});
test('combined shop and broker percentages cannot exceed 100 before any stock or accounting mutation',async()=>{
 const h=harness(),f=saleForm(85);f.set('broker_id','9');f.set('broker_pct','20');await assert.rejects(h.actions.createSale(f),/cannot exceed/);assert.equal(h.calls.length,0);
});

test('delivery records separate manufacturing and box costs with a per-line cost choice',async()=>{
 const h=harness();await assert.rejects(h.actions.createSale(saleForm(null,['FULL','BOX','MANUFACTURING'].map(costBasis=>({batchId:2,quantity:2,discountPct:20,costBasis})))),e=>e.location==='/invoices/4');
 const saved=h.calls.filter(c=>c.sql.startsWith('INSERT INTO invoice_items'));
 assert.equal(saved.length,3);
 for(const [index,cost] of ['450.00','20.00','430.00'].entries()){assert.equal(saved[index].args[8],cost);assert.equal(saved[index].args[13],430);assert.equal(saved[index].args[14],20);assert.equal(saved[index].args[7],'1036.00');}
 assert.deepEqual(saved.map(s=>s.args[12]),['FULL','BOX','MANUFACTURING']);
});
test('invalid cost choices cannot dispatch stock',async()=>{const h=harness();await assert.rejects(h.actions.createSale(saleForm(null,[{batchId:2,quantity:1,discountPct:0,costBasis:'FREE'}])));assert.equal(h.calls.length,0);});
test('new product saves full manufacturing plus box cost',async()=>{const h=harness(),f=new FormData();for(const [k,v] of Object.entries({sku:'COST',name:'Product',manufacturer_price:'430',box_cost:'20',retail_price:'1295'}))f.set(k,v);await assert.rejects(h.actions.createProduct(f),e=>e.location==='/products?created=5');const insert=h.calls.find(c=>c.sql.startsWith('INSERT INTO products'));assert.equal(insert.args[5],430);assert.equal(insert.args[6],450);assert.equal(insert.args[12],20);});

test('stock shortage returns inline feedback with current stock and combined quantity',async()=>{
 const h=harness();const result=await h.actions.submitSale({},saleForm(null,[{batchId:2,quantity:60,discountPct:20},{batchId:2,quantity:60,discountPct:30}]));
 assert.match(result.error,/Available: 100 units; requested across all rows: 120/);assert.equal(result.stock.batchId,2);assert.equal(result.stock.available,100);assert.equal(result.stock.requested,120);assert.equal(h.calls.some(c=>c.sql.startsWith('INSERT INTO invoices')),false);
});
test('form submission preserves successful invoice redirect and handles invalid fields',async()=>{
 const h=harness();await assert.rejects(h.actions.submitSale({},saleForm(20)),e=>e.location==='/invoices/4');
 const invalid=harness();assert.match((await invalid.actions.submitSale({},saleForm(20,[{batchId:2,quantity:0,discountPct:20}]))).error,/whole-number quantities/);assert.equal(invalid.calls.length,0);
});
