const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(path,imports={}){const exports={};new Function('require','exports',compile(path))(n=>imports[n]||require(n),exports);return exports;}
const logic=load('lib/sales-team.ts'),utils=load('lib/utils.ts');
const {OrderProfitBreakdown}=load('components/OrderProfitBreakdown.tsx',{'@/lib/sales-team':logic,'@/lib/utils':utils});
test('cost breakdown shows the saved percentage, total costs, agent profit and owner net with estimate labels',()=>{
 const html=renderToStaticMarkup(React.createElement(OrderProfitBreakdown,{agentName:'Agent Example',initial:{status:'DISPATCHED',retail_total:2000,product_cost:1000,shipping_charge:200,courier_cost:280,shipping_cost:20,return_cost:0,commission_pct:25}}));
 for(const text of ['Agent Example','25.00%','Estimated on delivery','Total costs applied','1,300.00','900.00','225.00','675.00','My estimated net profit','Save order and status'])assert.ok(html.includes(text),text);
});
test('retail preview names the broker and shows both commission amounts and net profit',()=>{
 const html=renderToStaticMarkup(React.createElement(OrderProfitBreakdown,{agentName:'Sales Agent',brokerName:'Broker Example',initial:{status:'DISPATCHED',retail_total:1295,product_cost:430,shipping_charge:0,courier_cost:280,shipping_cost:0,return_cost:0,commission_pct:20,commission_basis:'RETAIL',broker_id:2,broker_pct:10}}));
 for(const text of ['Broker Example','20.00%','10.00%','259.00','129.50','196.50','commission base, excludes shipping'])assert.ok(html.includes(text),text);
});
test('returned package shows the agent deduction and explains the owner receivable without claiming cash recovery',()=>{
 const html=renderToStaticMarkup(React.createElement(OrderProfitBreakdown,{agentName:'Sales Agent',initial:{status:'RETURNED',retail_total:1295,product_cost:430,shipping_charge:0,courier_cost:280,shipping_cost:20,return_cost:100,commission_pct:20,commission_basis:'RETAIL'}}));
 for(const text of ['Return costs charged to sales agent','Sales agent net / amount due','-400.00','Business net includes this agent receivable','no cash repayment has been recorded'])assert.ok(html.includes(text),text);
});
