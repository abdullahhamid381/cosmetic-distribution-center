const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const moduleObject={exports:{}};
const source=ts.transpileModule(fs.readFileSync('lib/payment-receipts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module:moduleObject,exports:moduleObject.exports,Buffer});
const {readPaymentReceipt,savePaymentReceipt}=moduleObject.exports;
function form(data,name='receipt.pdf',type='application/pdf') {
 const value=new FormData();value.set('receipt',new Blob([data],{type}),name);return value;
}
test('receipt is optional',async()=>assert.equal(await readPaymentReceipt(new FormData()),null));
test('receipt type is detected from bytes',async()=>{
 const receipt=await readPaymentReceipt(form('%PDF-1.7\n','bank-slip.pdf','text/plain'));
 assert.equal(receipt.mime,'application/pdf');assert.equal(receipt.name,'bank-slip.pdf');
 assert.equal(receipt.data.toString(),'%PDF-1.7\n');
});
test('HTML renamed to an image is rejected',async()=>{
 await assert.rejects(readPaymentReceipt(form('<html>fake</html>','fake.png','image/png')),/Upload a PDF/);
});
test('files larger than 5 MB are rejected',async()=>{
 await assert.rejects(readPaymentReceipt(form(Buffer.alloc(5*1024*1024+1))),/5 MB/);
});
test('saving a replacement receipt stays inside the caller transaction',async()=>{
 let saved;
 await savePaymentReceipt({query:async(sql,args)=>{saved={sql,args};}},4,{name:'slip.pdf',mime:'application/pdf',data:Buffer.from('%PDF-')},1);
 assert.match(saved.sql,/ON CONFLICT\(payment_id\) DO UPDATE/);
 assert.equal(saved.args[0],4);assert.equal(saved.args[4],1);
});
