const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const utils={},logic={};new Function('require','exports',compile('lib/utils.ts'))(require,utils);new Function('require','exports',compile('lib/sales-team.ts'))(require,logic);
const order={id:'1',agent_id:'1',status:'PENDING',customer_name:'Customer Example',phone:'03001234567',address:'House 1',city:'Lahore',agent_name:'Agent Example',created_at:'2026-10-01',retail_total:'1000',product_cost:'400',shipping_charge:'100',courier_cost:'80',shipping_cost:'20',return_cost:'0',commission_pct:'20',collected:'500',priority:'HIGH'};
const component=({children,submitLabel})=>React.createElement('div',null,children,submitLabel?React.createElement('button',null,submitLabel):null);
function page(path,{role='ADMIN',visible=true}={}){
 const exports={},scope=[];
 new Function('require','exports',compile(path))(n=>{
  if(n==='@/lib/auth')return {requireRole:async()=>({id:7,role})};
  if(n==='@/lib/db')return {query:async sql=>sql.includes('customer_order_items')?[{id:1,batch_id:1,quantity:1,retail_price:1000,unit_cost:400,name:'Product Example',sku:'SKU-1',batch_number:'B-1',warehouse:'Main'}]:[]};
  if(n==='@/lib/sales-team-data')return {customerOrders:async(userId,id)=>{scope.push({userId,id});return visible?[order]:[];}};
  if(n==='@/lib/utils')return utils;if(n==='@/lib/sales-team')return logic;
  if(n==='next/link')return {__esModule:true,default:({href,children})=>React.createElement('a',{href},children)};
  if(n==='next/navigation')return {notFound:()=>{throw new Error('NOT_FOUND');}};
  if(n.startsWith('@/app/'))return {};
  if(n.startsWith('@/components/'))return new Proxy({},{get:(_,key)=>key==='__esModule'?false:component});
  return require(n);
 },exports);return {Page:exports.default,scope};
}
test('customer invoice renders retail and payment balances without internal margins or commission',async()=>{
 const {Page}=page('app/(admin)/sales-team/[id]/print/page.tsx');const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'1'})}));
 assert.match(html,/Customer Example/);assert.match(html,/Product Example/);assert.match(html,/Amount due/);assert.match(html,/600\.00/);
 assert.doesNotMatch(html,/Product cost|Business net|Commission rate|unit_cost/);
});
test('order detail renders customer, costs, priority and pending products controls',async()=>{
 const {Page}=page('app/(admin)/sales-team/[id]/page.tsx');const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'1'})}));
 assert.match(html,/Customer name/);assert.match(html,/Courier cost/);assert.match(html,/Expected delivery/);assert.match(html,/HIGH/);assert.match(html,/Save order and status/);
});
test('sales detail pages pass agent scope and hide management controls',async()=>{
 const {Page,scope}=page('app/(admin)/sales-team/[id]/page.tsx',{role:'SALES'});const html=renderToStaticMarkup(await Page({params:Promise.resolve({id:'1'})}));
 assert.deepEqual(scope,[{userId:7,id:'1'}]);assert.doesNotMatch(html,/Save order and status/);
 const hidden=page('app/(admin)/sales-team/[id]/print/page.tsx',{role:'SALES',visible:false});await assert.rejects(hidden.Page({params:Promise.resolve({id:'1'})}),/NOT_FOUND/);
});
