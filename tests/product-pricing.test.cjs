const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/product-pricing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports});
const {tradeFromRetail,productTradePrice}=mod.exports;
test('retail discount calculates trade price and rounds to paisa',()=>{
 assert.equal(tradeFromRetail(1295,40),777);
 assert.equal(tradeFromRetail(1295,30),906.5);
 assert.equal(tradeFromRetail(999.99,12.5),874.99);
 assert.equal(tradeFromRetail(1295,0),1295);
 assert.equal(tradeFromRetail(1295,100),0);
});
test('server calculates price from percentage instead of trusting posted trade price',()=>{
 assert.equal(productTradePrice(1295,'1','40'),777);
 assert.equal(productTradePrice(1295,'777',''),777);
 assert.equal(productTradePrice(1295,'777',null),777);
});
test('rejects out-of-range and nonnumeric pricing',()=>{
 for(const pct of [-1,101,NaN,Infinity])assert.throws(()=>tradeFromRetail(1295,pct));
 assert.throws(()=>tradeFromRetail(-1,40));
 assert.throws(()=>productTradePrice(1295,'',''));
});
