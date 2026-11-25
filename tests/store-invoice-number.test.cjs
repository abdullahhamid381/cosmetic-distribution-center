const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const out={};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/store-invoice-number.ts','utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText)(out);

test('invoice numbering reuses the first free reference, independently for each shop prefix',async()=>{
 const numbers=new Set(['SHOP-A-INV-0001','SHOP-A-INV-0003','SHOP-B-INV-0001']);
 const tx={query:async(sql,args)=>{
  if(sql.startsWith('SELECT store_code')){
   assert.match(sql,/FOR UPDATE/);
   const storeCode={1:'SHOP-A',2:'SHOP-B'}[args[0]];
   return {rows:storeCode?[{store_code:storeCode}]:[]};
  }
  if(sql.startsWith('SELECT invoice_no')){
   return {rows:[...numbers].filter(number=>number.startsWith(args[0])).map(invoice_no=>({invoice_no}))};
  }
  assert.match(sql,/UPDATE shops SET invoice_sequence/);
  return {rows:[]};
 }};
 assert.equal(await out.nextStoreInvoiceNumber(tx,1),'SHOP-A-INV-0002');
 assert.equal(await out.nextStoreInvoiceNumber(tx,2),'SHOP-B-INV-0002');
 numbers.delete('SHOP-B-INV-0001');
 assert.equal(await out.nextStoreInvoiceNumber(tx,2),'SHOP-B-INV-0001');
 for(let i=1;i<=9999;i++)numbers.add('SHOP-A-INV-'+String(i).padStart(4,'0'));
 assert.equal(await out.nextStoreInvoiceNumber(tx,1),'SHOP-A-INV-10000');
 await assert.rejects(out.nextStoreInvoiceNumber(tx,3),/Store not found/);
});
