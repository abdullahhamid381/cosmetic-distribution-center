const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(path,imports={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(name=>Object.hasOwn(imports,name)?imports[name]:require(name),exports);return exports;}
const {BrokerPayoutTable}=load('components/BrokerPayoutTable.tsx',{
 '@/components/DepartmentForm':{DepartmentForm:({children,submitLabel})=>React.createElement('form',null,children,React.createElement('button',null,submitLabel))},
 '@/components/PaymentReceiptInput':{PaymentReceiptInput:props=>React.createElement('input',{type:'file',name:'receipt',...props})},
 '@/app/broker-actions':{attachBrokerPayoutReceipt:async()=>({success:'Saved'})},
 '@/lib/utils':load('lib/utils.ts')
});
const payout={id:12,broker_source:'SHOP',full_name:'Example Broker',payment_date:'2026-10-26',payment_day:'Monday',payment_time:'14:35:20',amount:100,balance_before:300,balance_after:200,method:'BANK',reference:'REF-12',note:'Part payment',recorded_at:'2026-10-26 14:40:00',recorded_by:'Business Owner',receipt_name:'bank-slip.pdf'};
test('broker payment table shows dated payment details, saved balances and receipt controls',()=>{
 const html=renderToStaticMarkup(React.createElement(BrokerPayoutTable,{payouts:[payout]}));
 for(const text of ['BP-12','Example Broker','Shop broker','Monday','14:35:20 PKT','Rs. 100.00','Before: Rs. 300.00','After: Rs. 200.00','BANK','REF-12','Part payment','2026-10-26 14:40:00 PKT','Business Owner','bank-slip.pdf','/api/broker-payouts/12/receipt?download=1','broker-receipt-12'])assert.ok(html.includes(text),text);
 assert.match(html,/name="payout_id" value="12"/);assert.match(html,/required=""/);
});
test('older payments do not invent missing time or balance snapshots',()=>{
 const html=renderToStaticMarkup(React.createElement(BrokerPayoutTable,{payouts:[{...payout,id:13,broker_source:'LEGACY',payment_time:null,balance_before:null,balance_after:null,receipt_name:null}]}));
 for(const text of ['Unassigned legacy payout','Payment time not recorded','Before: Not recorded','After: Not recorded','No receipt uploaded','Upload receipt','broker-receipt-13'])assert.ok(html.includes(text),text);
});
test('empty history and view-only history are supported',()=>{
 assert.match(renderToStaticMarkup(React.createElement(BrokerPayoutTable,{payouts:[]})),/No broker payments recorded/);
 const html=renderToStaticMarkup(React.createElement(BrokerPayoutTable,{payouts:[payout],allowUpload:false}));
 assert.ok(html.includes('View receipt'));assert.ok(!html.includes('<form'));assert.ok(!html.includes('Replace receipt'));
});
