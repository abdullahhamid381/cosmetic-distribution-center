const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');

function load(file,dependencies={}) {
 const module={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:name=>dependencies[name]??require(name),FormData,URL,URLSearchParams,console});
 return module.exports;
}
function harness(respond,user={id:1,role:'ADMIN'}) {
 const queries=[];
 const actions=load('app/record-actions.ts',{
  'next/navigation':{redirect:location=>{throw Object.assign(new Error('redirect'),{location});}},
  'next/cache':{revalidatePath:()=>{}},
  '@/lib/auth':{requireRole:async(...roles)=>{if(!roles.includes(user.role))throw new Error('Forbidden');return user;}},
  '@/lib/db':{transaction:async fn=>fn({query:async(sql,args)=>{queries.push({sql,args});const rows=respond(sql,args)||[];return {rows,rowCount:rows.length};}})},
  '@/lib/records':load('lib/records.ts'),
  '@/lib/utils':load('lib/utils.ts'),
  '@/lib/product-pricing':load('lib/product-pricing.ts'),
  '@/lib/payment-receipts':{readPaymentReceipt:async()=>null,savePaymentReceipt:async()=>{}},
  '@/lib/store-invoice-number':load('lib/store-invoice-number.ts'),
 });
 return {actions,queries};
}
async function remove(h,entity,id=2) {
 const form=new FormData();form.set('entity',entity);form.set('id',String(id));
 try{await h.actions.deleteRecord(form);}catch(error){if(error.location)return error.location;throw error;}
 throw new Error('Expected redirect');
}
test('payment deletion reverses each allocation before removing the receipt',async()=>{
 const h=harness(sql=>sql.startsWith('SELECT * FROM payments')?[{id:2,amount:'30.00'}]:sql.startsWith('SELECT * FROM payment_allocations')?[{invoice_id:5,amount:'10.00'},{invoice_id:6,amount:'20.00'}]:[]);
 assert.equal(await remove(h,'payments'),'/payments');
 const updates=h.queries.filter(q=>q.sql.startsWith('UPDATE invoices'));
 assert.equal(updates.length,2);assert.deepEqual(updates.map(q=>Array.from(q.args)),[['10.00',5],['20.00',6]]);
 assert.ok(h.queries.findIndex(q=>q.sql.startsWith('DELETE FROM payments'))>h.queries.findIndex(q=>q.sql.startsWith('DELETE FROM payment_allocations')));
});
test('invoice with payments cannot be deleted or restore stock twice',async()=>{
 const h=harness(sql=>sql==='SELECT * FROM invoices WHERE id=$1 FOR UPDATE'?[{id:2,paid_total:10,credit_total:0}]:sql.includes('UNION ALL')?[{id:3}]:[]);
 assert.match(await remove(h,'invoices'),/error=/);
 assert.equal(h.queries.some(q=>/^(UPDATE|DELETE)/.test(q.sql)),false);
});
test('invoice deletion restores batch stock and removes its delivery',async()=>{
 const h=harness(sql=>sql==='SELECT * FROM invoices WHERE id=$1 FOR UPDATE'?[{id:2,paid_total:0,credit_total:0,delivery_id:9}]:sql.startsWith('SELECT * FROM invoice_items')?[{batch_id:7,quantity:4}]:sql.startsWith('UPDATE batches')?[{id:7,product_id:8,warehouse_id:1}]:[]);
 assert.equal(await remove(h,'invoices'),'/invoices');
 assert.deepEqual(Array.from(h.queries.find(q=>q.sql.startsWith('UPDATE batches')).args),[4,7]);
 assert.ok(h.queries.some(q=>q.sql.includes("'INVOICE_CANCELLATION'")));
 assert.ok(h.queries.some(q=>q.sql==='DELETE FROM deliveries WHERE id=$1'));
 const archive=h.queries.findIndex(q=>q.sql.startsWith('INSERT INTO record_trash'));
 assert.ok(archive>=0&&archive<h.queries.findIndex(q=>q.sql.startsWith('DELETE FROM invoices')));
 assert.match(h.queries[archive].sql,/invoice_items.*delivery_items/s);
});

test('invoice list Delete moves the invoice to Trash and returns to the filtered list',async()=>{
 const h=harness(sql=>sql.startsWith('SELECT * FROM invoices')?[{id:2,paid_total:0,credit_total:0}]:[]);
 const form=new FormData();form.set('id','2');
 await assert.rejects(h.actions.deleteInvoiceFromList('shop=3&status=unpaid',form),
  error=>error.location==='/invoices?shop=3&status=unpaid&deleted=1');
 assert.ok(h.queries.some(q=>q.sql.startsWith('INSERT INTO record_trash')));
 assert.ok(h.queries.some(q=>q.sql.startsWith('DELETE FROM invoices')));
});

async function restore(h) {
 const form=new FormData();form.set('entity','invoices');form.set('id','8');
 try{await h.actions.restoreRecord(form);}catch(error){if(error.location)return decodeURIComponent(error.location);throw error;}
 throw new Error('Expected redirect');
}

function invoiceRestore(stockAvailable) {
 return harness(sql=>{
  if(sql.startsWith('SELECT record_id'))return [{record_id:'2'}];
  if(sql.startsWith("SELECT snapshot->'record'"))return [{id:'2',shop_id:'1',invoice_no:'SHOP-INV-0001',warehouse_id:'3',delivery_no:'DEL-000001',total:'20.00'}];
  if(sql.startsWith('SELECT id,active,credit_limit'))return [{id:'1',active:true,credit_limit:'100.00'}];
  if(sql.includes('AS exceeded'))return [{exceeded:false}];
  if(sql.startsWith('SELECT id FROM warehouses'))return [{id:'3'}];
  if(sql.includes('SUM(i.quantity)'))return [{batch_id:'7',quantity:4}];
  if(sql.startsWith('SELECT id FROM invoices WHERE invoice_no'))return [{id:'9'}];
  if(sql.startsWith('SELECT store_code'))return [{store_code:'SHOP'}];
  if(sql.startsWith('SELECT invoice_no'))return [{invoice_no:'SHOP-INV-0001'}];
  if(sql.startsWith('UPDATE batches')&&stockAvailable)return [{id:'7',product_id:'6',warehouse_id:'3'}];
  return [];
 });
}

test('restoring a reused invoice number assigns the next free number and deducts stock before activating the invoice',async()=>{
 const h=invoiceRestore(true);
 assert.match(await restore(h),/restored as SHOP-INV-0002/);
 assert.deepEqual(Array.from(h.queries.find(q=>q.sql.startsWith('UPDATE batches')).args),['7',-4]);
 assert.deepEqual(Array.from(h.queries.find(q=>q.sql.startsWith('INSERT INTO invoices')).args),[8,'SHOP-INV-0002']);
 assert.ok(h.queries.at(-1).sql.startsWith('DELETE FROM record_trash'));
});

test('restoring when stock has been sold leaves the invoice in trash',async()=>{
 const h=invoiceRestore(false);
 assert.match(await restore(h),/insufficient stock/);
 assert.equal(h.queries.some(q=>q.sql.startsWith('INSERT INTO invoices')||q.sql.startsWith('DELETE FROM record_trash')),false);
});
test('staff cannot disable their own account',async()=>{
 const h=harness(sql=>sql.startsWith('SELECT * FROM users')?[{id:1}]:[]);
 assert.match(await remove(h,'staff',1),/error=/);
 assert.equal(h.queries.some(q=>q.sql.startsWith('UPDATE')),false);
});
test('return reversal stops if returned units are no longer in stock',async()=>{
 const h=harness(sql=>sql.startsWith('SELECT * FROM sales_returns')?[{id:2,invoice_id:5,total_credit:'20.00'}]:sql.includes('SELECT ri.*')?[{batch_id:7,quantity:2}]:[]);
 assert.match(await remove(h,'returns'),/error=/);
 assert.equal(h.queries.some(q=>q.sql.startsWith('DELETE FROM sales_return_items')||q.sql.startsWith('UPDATE invoices SET credit_total')),false);
});
test('unauthorized staff cannot delete payments',async()=>{
 const h=harness(()=>[],{id:3,role:'SALES'});
 await assert.rejects(remove(h,'payments'),/Forbidden/);
 assert.equal(h.queries.length,0);
});
test('assigning Sales Agent to an existing staff account provisions its portal without overwriting its settings',async()=>{
 const h=harness(sql=>sql.startsWith('SELECT * FROM users')?[{id:2,role:'MANAGER',active:true}]:[]);
 const form=new FormData();for(const [key,value] of Object.entries({entity:'staff',id:'2',full_name:'Agent',email:'agent@example.invalid',role:'SALES',active:'on'}))form.set(key,value);
 await assert.rejects(h.actions.saveRecord(form),e=>e.location==='/staff');
 const provision=h.queries.find(q=>q.sql.startsWith('INSERT INTO sales_agents'));assert.ok(provision);assert.match(provision.sql,/ON CONFLICT\(user_id\) DO NOTHING/);assert.deepEqual(Array.from(provision.args),[2]);
});
