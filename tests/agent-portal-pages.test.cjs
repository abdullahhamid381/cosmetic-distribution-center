const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function load(p,imports={}){const exports={};new Function('require','exports',compile(p))(n=>Object.hasOwn(imports,n)?imports[n]:require(n),exports);return exports;}
const logic=load('lib/sales-team.ts'),utils=load('lib/utils.ts');
const Component=({children})=>React.createElement('div',null,children);
test('agent order form uses products, has all payment choices, and has no agent assignment selector',()=>{
 const {CustomerOrderForm}=load('components/CustomerOrderForm.tsx',{'./DepartmentForm':{DepartmentForm:Component},'@/app/sales-team-actions':{},'@/lib/utils':utils,'@/lib/sales-team':logic});
 const html=renderToStaticMarkup(React.createElement(CustomerOrderForm,{agentMode:true,agents:[],batches:[{id:'1',label:'Product One',price:1000}]}));
 assert.match(html,/name="product_id"/);assert.doesNotMatch(html,/name="agent_id"|name="batch_id"/);assert.match(html,/Cash on delivery/);assert.match(html,/Advance payment/);assert.match(html,/Payment pending/);assert.match(html,/Customer payment/);assert.match(html,/Quantity/);
});
function orderPage({visible=true}={}){
 const scopes=[],queries=[];
 const order={id:'1',status:'PENDING',customer_name:'MY_CUSTOMER',phone:'03000000000',retail_total:1000,product_cost:400,shipping_charge:100,collected:0,pending_advance:0,payment_plan:'COD'};
 const exports=load('app/(admin)/agent/orders/[id]/page.tsx',{
  '@/lib/agent-portal':{requireAgent:async()=>({user:{id:7}})},
  '@/lib/sales-team-data':{customerOrders:async(user,id)=>{scopes.push({user,id});return visible?[order]:[];}},
  '@/lib/db':{query:async(sql,args)=>{queries.push(args);return [];}},
  '@/lib/sales-team':logic,'@/lib/utils':utils,
  'next/link':{__esModule:true,default:({href,children})=>React.createElement('a',{href},children)},
  'next/navigation':{notFound:()=>{throw new Error('NOT_FOUND');}},
  '@/components/DepartmentStats':{DepartmentStats:Component},'@/components/DepartmentForm':{DepartmentForm:Component},
  '@/app/agent-portal-actions':{},'@/app/sales-department-actions':{}
 });return {...exports,scopes,queries};
}
test('agent order page scopes identity before any customer, product, payment or activity queries',async()=>{
 const hidden=orderPage({visible:false});await assert.rejects(hidden.default({params:Promise.resolve({id:'999'})}),/NOT_FOUND/);assert.deepEqual(hidden.scopes,[{user:7,id:'999'}]);assert.equal(hidden.queries.length,0);
 const own=orderPage();const html=renderToStaticMarkup(await own.default({params:Promise.resolve({id:'1'})}));assert.match(html,/MY_CUSTOMER/);assert.match(html,/Cash on delivery/);assert.match(html,/Confirmed payments/);assert.doesNotMatch(html,/Product cost|Business net|Unit cost|Margin/);assert.ok(own.queries.every(args=>args[0]==='1'));
});
