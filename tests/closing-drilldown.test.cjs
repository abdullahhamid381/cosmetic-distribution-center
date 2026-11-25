const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>deps[name]||require(name),out);return out;}
const helper=load('lib/closing-drilldown.ts'),monthly=load('lib/monthly-statement.ts');
const data=[
 {id:'1',invoice_no:'HBC-000001-INV-0001',shop_id:'1',shop_name:'Shop A',issue_date:'2026-10-10',original:'100',opening:'80',received:'20',credits:'10',closing:'50'},
 {id:'2',invoice_no:'HBC-000001-INV-0002',shop_id:'1',shop_name:'Shop A',issue_date:'2026-10-20',original:'200',opening:'0',received:'100',credits:'20',closing:'80'},
 {id:'3',invoice_no:'NC-000002-INV-0001',shop_id:'2',shop_name:'Shop B',issue_date:'2026-09-01',original:'150',opening:'70',received:'70',credits:'0',closing:'0'},
];
const statements=monthly.buildMonthlyStatements(data,'2026-10',new Map(),'2026-10-16');
test('each invoice detail category reconciles exactly to its closing summary amount',()=>{
 const expected={opening:-150,sales:200,previousPending:-50,currentPending:-80,carry:-130,previousReceipts:90,currentReceipts:100,credits:30,previousCredits:10};
 for(const [kind,total] of Object.entries(expected)){
  const rows=helper.closingInvoiceRows(statements,'2026-10-16',kind);
  assert.equal(rows.reduce((sum,i)=>sum+helper.closingInvoiceValue(i,kind),0),total,kind);
 }
});
test('shop filters stay isolated and fully settled prior invoices remain in collection detail',()=>{
 assert.deepEqual(helper.closingInvoiceRows(statements,'2026-10-16','carry','1').map(i=>i.id),['1','2']);
 assert.equal(helper.closingInvoiceRows(statements,'2026-10-16','carry','2').length,0);
 assert.deepEqual(helper.closingInvoiceRows(statements,'2026-10-16','previousReceipts','2').map(i=>i.id),['3']);
 assert.deepEqual(helper.closingInvoiceRows(statements,'2026-10-16','previousPending').map(i=>i.id),['1']);
 assert.equal(helper.closingInvoiceRows(statements,'2026-10-16','all','2').length,1);
});
test('drilling into a saved snapshot never changes its values or substitutes current balances',()=>{
 const before=JSON.stringify(statements);
 const selected=helper.closingInvoiceRows(statements,'2026-10-16','opening');
 selected[0].opening='999';
 assert.equal(JSON.stringify(statements),before);
 assert.equal(helper.closingInvoiceRows([], '2026-10-16','carry').length,0);
});
test('detail panel renders accessible amount controls and direct full-invoice and PDF links',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const component=load('components/ClosingDrilldown.tsx',{'@/lib/closing-drilldown':helper,'next/link':({href,children,...props})=>React.createElement('a',{href,...props},children)});
 const html=renderToStaticMarkup(React.createElement(component.ClosingDrilldownProvider,{statements,financials:null,from:'2026-10-16',to:'2026-10-23',shop:'',saved:true},React.createElement(component.ClosingAmount,{kind:'carry'},'Rs. -130.00')));
 assert.match(html,/<dialog/);assert.match(html,/aria-labelledby=/);assert.match(html,/View unpaid invoices carried forward/);assert.match(html,/Saved closing snapshot/);
 assert.match(html,/href="\/invoices\/1"/);assert.match(html,/href="\/invoices\/1\/print"/);assert.match(html,/HBC-000001-INV-0001/);
});
