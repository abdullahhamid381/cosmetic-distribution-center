const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>deps[name]||require(name),out);return out;}
const service=load('lib/monthly-financials.ts',{'./db':{},'./monthly-statement':load('lib/monthly-statement.ts')});
test('missing, null and malformed saved registers normalize safely without live data substitution',()=>{
 const live=service.collectionClosing({expenses:[{reference:'EXP-LIVE',amount:999}],goods:[],payments:[],returns:[],from:'2026-10-01',through:'2026-10-23'});
 for(const input of [undefined,null,{netProfit:-100},{expenses:null,goods:{},returns:null}]){
  const normalized=service.collectionClosing(input,live);
  for(const key of ['expenses','goods','returns','payments'])assert.ok(Array.isArray(normalized[key]));
  assert.equal(normalized.expenses.length,0);assert.ok(normalized.missingRegisters.length);assert.ok(Number.isFinite(normalized.netProfit));assert.equal(service.isCompleteFinancialSnapshot(normalized),false);
 }
});
test('saved aggregate figures survive missing detail arrays and original snapshot is unchanged',()=>{
 const saved={received:77130,netGoodsCost:151300,deductedExpenses:13000,businessExpenses:13000,sales:321090,returnCredits:0};
 const before=JSON.stringify(saved),normalized=service.collectionClosing(saved);
 assert.equal(normalized.netProfit,-87170);assert.equal(normalized.businessExpenses,13000);assert.equal(JSON.stringify(saved),before);
 assert.equal(service.isCompleteFinancialSnapshot(saved),false);
 assert.equal(service.isCompleteFinancialSnapshot(service.collectionClosing({from:'2026-10-01',through:'2026-10-23',goods:[],expenses:[],payments:[],returns:[]})),true);
});
test('incomplete saved financial screen renders a clear recovery notice without crashing',()=>{
 const {MonthlyFinancialDetails}=load('components/MonthlyFinancialDetails.tsx',{'@/lib/monthly-financials':service,'@/lib/utils':load('lib/utils.ts'),'@/components/ClosingDrilldown':{}});
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const html=renderToStaticMarkup(React.createElement(MonthlyFinancialDetails,{data:{netProfit:-100},saved:true}));
 assert.match(html,/Saved financial details are incomplete/);assert.match(html,/Reopen the closing/);assert.ok(!html.includes('NaN'));
});
test('saved PDF and Word model marks missing financial detail instead of inventing empty registers',()=>{
 const {monthlyReportDocument}=load('lib/monthly-report-document.ts',{'./monthly-financials':service,'./utils':load('lib/utils.ts')});
 const doc=monthlyReportDocument([],'2026-10','Owner','All shops','Saved statement',new Date('2026-10-23T05:00:00Z'),{netProfit:-100});
 assert.ok(doc.notes.some(n=>n.includes('financial registers are incomplete')));assert.ok(!doc.tables.some(t=>t.title==='Complete operating expense register'));assert.ok(!JSON.stringify(doc).includes('NaN'));
});
