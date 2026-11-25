const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const out={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/report-roi.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);
const {reportRoi,roiLabel}=out;
test('ROI deducts broker commission and uses product costs plus expenses',()=>{
 const r=reportRoi({sales:31080,gross:19980,expenses:0,pending:0,brokerFull:7770,brokerReleased:7770});
 assert.equal(r.investment,11100);assert.equal(r.expectedProfit,12210);assert.equal(r.expectedRoi,110);assert.equal(r.receivedRoi,110);assert.equal(roiLabel(r.expectedRoi),'110.00%');
});
test('received ROI excludes pending sales and deducts only released broker commission',()=>{
 const r=reportRoi({sales:800,gross:400,expenses:100,pending:400,brokerFull:200,brokerReleased:100});
 assert.equal(r.investment,500);assert.equal(r.expectedRoi,20);assert.equal(r.receivedProfit,-200);assert.equal(r.receivedRoi,-40);
});
test('no cost investment gives N/A rather than infinity or a misleading zero',()=>{
 const r=reportRoi({sales:100,gross:100,expenses:0,pending:0,brokerFull:20,brokerReleased:20});assert.equal(r.expectedRoi,null);assert.equal(r.receivedRoi,null);assert.equal(roiLabel(null),'N/A');
});
