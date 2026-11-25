const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
function load(path,imports={}){const exports={};new Function('require','exports',compile(path))(n=>Object.hasOwn(imports,n)?imports[n]:n.startsWith('@/')?{}:require(n),exports);return exports;}
const logic=load('lib/sales-team.ts');
test('reported advances remain pending until verified money reaches the ledger',()=>{
 const order={status:'PENDING',retail_total:1000,shipping_charge:100,collected:0,pending_advance:500};
 assert.match(logic.customerPaymentStatus(order),/awaiting verification/);assert.equal(logic.paymentBalance(order).due,1100);
 assert.equal(logic.customerPaymentStatus({...order,collected:1100,pending_advance:0}),'Paid');
 assert.equal(logic.customerPaymentStatus({...order,collected:500,pending_advance:0}),'Partially paid');
 assert.equal(logic.customerPaymentStatus({...order,status:'RETURNED',collected:500}),'Refund due');
});
test('SALES cannot call shared shop creation, distribution or delivery actions',async()=>{
 let writes=0;
 const actions=load('app/actions.ts',{'@/lib/auth':{requireRole:async(...roles)=>{assert.ok(!roles.includes('SALES'));throw new Error('Forbidden');}},'@/lib/db':{transaction:async()=>{writes++;}}});
 for(const name of ['createShop','createSale','markDelivered'])await assert.rejects(actions[name](new FormData()),/Forbidden/);
 assert.equal(writes,0);
});
test('disabled agent accounts and reset-password sessions fail authentication',async()=>{
 async function check({version=0,tokenVersion=0,visible=true}={}){
  const auth=load('lib/auth.ts',{'server-only':{},react:{cache:fn=>fn},'next/headers':{cookies:async()=>({get:()=>({value:'session'})})},'next/navigation':{redirect:()=>{}},jose:{jwtVerify:async()=>({payload:{uid:'7',sv:tokenVersion}})},'./db':{query:async(sql,params)=>{assert.match(sql,/EXISTS\(SELECT 1 FROM sales_agents WHERE user_id=users.id AND active=true\)/);assert.equal(params[0],7);return visible?[{id:'7',full_name:'Agent',email:'agent@example.invalid',role:'SALES',session_version:version}]:[];}}});
  const before=process.env.SESSION_SECRET;process.env.SESSION_SECRET='test-session-secret-with-32-characters';try{return await auth.currentUser();}finally{if(before===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=before;}
 }
 assert.equal((await check()).id,7);assert.equal(await check({version:1,tokenVersion:0}),null);assert.equal(await check({visible:false}),null);
});
test('agent export ignores forged agent IDs and omits internal costs',async()=>{
 const utils=load('lib/utils.ts'),department=load('lib/sales-department.ts',{'./sales-team':logic});
 const scoped=[];const route=load('app/api/agent/orders/export/route.ts',{'@/lib/agent-portal':{requireAgent:async()=>({user:{id:7}})},'@/lib/sales-team':logic,'@/lib/sales-department':department,'@/lib/sales-team-data':{customerOrders:async id=>{scoped.push(id);return [{id:'1',customer_name:'MY_CUSTOMER',status:'PENDING',retail_total:'1000',shipping_charge:'0',collected:0,payment_plan:'COD'}];}}});
 const response=await route.GET(new Request('http://localhost/api/agent/orders/export?agent=999'));const body=await response.text();assert.deepEqual(scoped,[7]);assert.match(body,/MY_CUSTOMER/);assert.doesNotMatch(body,/Product cost|Business net|commission_pct|unit_cost/);assert.equal(response.headers.get('cache-control'),'private, no-store');
});
