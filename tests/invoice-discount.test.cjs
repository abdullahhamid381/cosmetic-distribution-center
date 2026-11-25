const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const out={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/invoice-discount.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);
const {invoiceDiscountSummary}=out;

test('uniform saved shop discount displays its percentage for string and numeric values',()=>{
 assert.deepEqual(invoiceDiscountSummary([{discount_pct:'20.00'},{discount_pct:20}],1000,200),{percentage:'20.00%',mixed:false});
 assert.deepEqual(invoiceDiscountSummary([{discount_pct:0}],0,0),{percentage:'0.00%',mixed:false});
});

test('mixed rates display the effective invoice discount clearly as overall percentage',()=>{
 assert.deepEqual(invoiceDiscountSummary([{discount_pct:10},{discount_pct:'30'}],'2000','500'),{percentage:'25.00% overall',mixed:true});
 assert.deepEqual(invoiceDiscountSummary([{discount_pct:10},{discount_pct:30}],0,0),{percentage:'varies by item',mixed:true});
});

test('empty invoices show zero or recover the recorded discount from their totals',()=>{
 assert.deepEqual(invoiceDiscountSummary([],0,0),{percentage:'0.00%',mixed:false});
 assert.deepEqual(invoiceDiscountSummary([],1000,200),{percentage:'20.00%',mixed:false});
});
