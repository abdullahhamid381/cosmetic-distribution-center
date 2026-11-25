const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/payment-request.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports});
const {validRequestedPayment}=mod.exports;
test('allows partial and full balance requests',()=>{
 assert.equal(validRequestedPayment('3000',8130),true);
 assert.equal(validRequestedPayment('8130.00',8130),true);
 assert.equal(validRequestedPayment('0.01',0.01),true);
});
test('rejects over-balance, zero, and malformed requests',()=>{
 for(const value of ['8130.01','0','-1','','NaN','Infinity','1e3','1.001'])assert.equal(validRequestedPayment(value,8130),false,value);
 assert.equal(validRequestedPayment('1',0),false);
});
