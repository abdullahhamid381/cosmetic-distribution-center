// Database integration checks. All fixtures, orders, payments and audit entries are rolled back.
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),pg=require('pg'),bcrypt=require('bcryptjs'),{randomUUID}=require('node:crypto');
require('dotenv').config({path:'.env.local',quiet:true});
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
function load(p,imports={}){const exports={};new Function('require','exports',compile(p))(n=>Object.hasOwn(imports,n)?imports[n]:require(n),exports);return exports;}
const utils=load('lib/utils.ts'),logic=load('lib/sales-team.ts');
const department=load('lib/sales-department.ts',{'./sales-team':logic});
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
let identity,profile;
const auth={requireRole:async(...roles)=>{if(!roles.includes(identity.role))throw new Error('Forbidden');return identity;},createSession:async()=>{}};
const navigation={redirect:path=>{throw Object.assign(new Error('REDIRECT'),{path});},unstable_rethrow:e=>{if(e.path)throw e;}};
const database={query:async(sql,params)=>(await db.query(sql,params)).rows,transaction:async fn=>{await db.query('SAVEPOINT portal_action');try{const r=await fn(db);await db.query('RELEASE SAVEPOINT portal_action');return r;}catch(e){await db.query('ROLLBACK TO SAVEPOINT portal_action');await db.query('RELEASE SAVEPOINT portal_action');throw e;}}};
const imports={'@/lib/payment-receipts':load('lib/payment-receipts.ts'),'@/lib/broker-payout-receipts':load('lib/broker-payout-receipts.ts'),'@/lib/broker-payment-time':load('lib/broker-payment-time.ts'),'@/lib/auth':auth,'@/lib/utils':utils,'@/lib/db':database,'@/lib/sales-team':logic,'@/lib/shop-broker':load('lib/shop-broker.ts'),'next/cache':{revalidatePath:()=>{}},'next/navigation':navigation,'@/lib/agent-portal':{requireAgent:async()=>{if(identity.role!=='SALES')throw new Error('Forbidden');return {user:identity,profile};}}};
const orders=load('app/sales-team-actions.ts',imports),portal=load('app/agent-portal-actions.ts',imports);
const brokerActions=load('app/broker-actions.ts',imports);
const departmentActions=load('app/sales-department-actions.ts',imports);
const data=load('lib/sales-team-data.ts',{'server-only':{},'./db':database});
const exportRoute=load('app/api/agent/orders/export/route.ts',{...imports,'@/lib/sales-team-data':data,'@/lib/sales-department':department});
function form(values){const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,String(v));return f;}
(async()=>{
 try{
  await db.connect();await db.query('BEGIN');
  const suffix=randomUUID();
  const staff=[];
  for(const role of ['ADMIN','SALES','SALES'])staff.push((await db.query('INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',['Portal isolation fixture',randomUUID()+'@portal-check.invalid','disabled-fixture-password',role])).rows[0]);
  const agents=[];for(const user of staff.slice(1))agents.push((await db.query('INSERT INTO sales_agents(user_id,commission_pct) VALUES($1,20) RETURNING *',[user.id])).rows[0]);
  const warehouse=(await db.query('INSERT INTO warehouses(name) VALUES($1) RETURNING id',['Portal check '+suffix])).rows[0];
  const product=(await db.query('INSERT INTO products(sku,name,trade_price,retail_price) VALUES($1,$2,1000,1000) RETURNING id',['PORTAL-CHECK-'+suffix,'Portal check product'])).rows[0];
  const batch=(await db.query('INSERT INTO batches(product_id,warehouse_id,batch_number,unit_cost,quantity_on_hand) VALUES($1,$2,$3,400,100) RETURNING id',[product.id,warehouse.id,suffix])).rows[0];
  const broker=(await db.query('INSERT INTO sales_brokers(full_name) VALUES($1) RETURNING id',['Broker fixture '+suffix])).rows[0];
  const asAgent=index=>{identity={id:Number(staff[index+1].id),role:'SALES'};profile=agents[index];};
  const submit=async(customer,extra={})=>{
   const f=form({agent_id:agents[1].id,customer_name:customer,phone:'03000000000',address:'Test address',city:'Test city',product_id:product.id,quantity:2,shipping_charge:100,payment_plan:'COD',retail_price:'0.01',...extra});
   try{await orders.createCustomerOrder(f);throw new Error('Expected redirect');}catch(e){if(!e.path)throw e;return Number(e.path.split('/').pop());}
  };
  asAgent(0);const aOrder=await submit('PRIVATE_CUSTOMER_A',{payment_plan:'ADVANCE',advance_amount:500,advance_method:'BANK',advance_reference:'CHECK-ADVANCE',broker_id:broker.id,commission_pct:99,broker_pct:99});
  const saved=(await db.query('SELECT agent_id FROM customer_orders WHERE id=$1',[aOrder])).rows[0];assert.equal(String(saved.agent_id),String(agents[0].id));
  const item=(await db.query('SELECT retail_price,quantity FROM customer_order_items WHERE order_id=$1',[aOrder])).rows[0];assert.equal(Number(item.retail_price),1000);assert.equal(item.quantity,2);
  assert.equal(Number((await db.query('SELECT quantity_on_hand FROM batches WHERE id=$1',[batch.id])).rows[0].quantity_on_hand),100);
  assert.equal((await db.query('SELECT id FROM customer_order_payments WHERE order_id=$1',[aOrder])).rows.length,0);
  console.log('PASS authenticated ownership, server retail prices, product quantities and unverified advance separation');
  asAgent(1);const bOrder=await submit('PRIVATE_CUSTOMER_B');
  asAgent(0);const own=await data.customerOrders(identity.id);assert.ok(own.some(o=>Number(o.id)===aOrder));assert.ok(!own.some(o=>Number(o.id)===bOrder));assert.equal((await data.customerOrders(identity.id,String(bOrder))).length,0);
  assert.equal((await data.departmentAgents(identity.id)).length,1);
  const denied=await portal.reportMyAdvance({},form({order_id:bOrder,amount:100,method:'CASH'}));assert.match(denied.error,/not found/);
  const exported=await exportRoute.GET(new Request('http://localhost/api/agent/orders/export?agent='+agents[1].id));const csv=await exported.text();assert.match(csv,/PRIVATE_CUSTOMER_A/);assert.doesNotMatch(csv,/PRIVATE_CUSTOMER_B|Product cost|Business net|Unit cost/);
  console.log('PASS cross-agent lists, direct order lookup, forged advance submission and export isolation');
  const report=(await db.query('SELECT id FROM order_payment_reports WHERE order_id=$1',[aOrder])).rows[0];
  assert.ok((await portal.reviewAgentAdvance({},form({report_id:report.id,decision:'VERIFIED'}))).error);
  identity={id:Number(staff[0].id),role:'ADMIN'};
  assert.ok((await portal.reviewAgentAdvance({},form({report_id:report.id,decision:'VERIFIED'}))).success);
  assert.match((await portal.reviewAgentAdvance({},form({report_id:report.id,decision:'VERIFIED'}))).error,/already/);
  const payments=(await db.query('SELECT amount FROM customer_order_payments WHERE order_id=$1',[aOrder])).rows;assert.equal(payments.length,1);assert.equal(Number(payments[0].amount),500);
  asAgent(0);const tooMuch=await portal.reportMyAdvance({},form({order_id:aOrder,amount:99999,method:'CASH'}));assert.match(tooMuch.error,/exceeds/);
  console.log('PASS manager-only advance verification, single confirmed collection and outstanding-balance limits');
  identity={id:Number(staff[0].id),role:'ADMIN'};
  const changeStatus=async(status,extra={})=>{const f=form({order_id:aOrder,customer_name:'PRIVATE_CUSTOMER_A',phone:'03000000000',address:'Test address',city:'Test city',status,courier_name:'Check courier',tracking_number:'CHECK',shipping_charge:100,courier_cost:280,shipping_cost:20,return_cost:0,status_note:'Fixture status update',...extra});const result=await orders.processCustomerOrder({},f);assert.ok(result.success,result.error);assert.ok(result.success.includes('Current status: '+status));assert.equal((await db.query('SELECT status FROM customer_orders WHERE id=$1',[aOrder])).rows[0].status,status);};
  await changeStatus('DISPATCHED');await changeStatus('DELIVERED');
  const actual=(await data.customerOrders(null,String(aOrder)))[0];assert.equal(actual.commission_basis,'RETAIL');assert.equal(Number(actual.commission_pct),20);assert.equal(Number(actual.broker_pct),10);
  const split=logic.orderFinancials(actual);assert.equal(split.commission,400);assert.equal(split.brokerCommission,200);assert.equal(split.net,400);
  assert.ok((await brokerActions.payBrokerCommission({},form({broker_id:broker.id,amount:200,method:'BANK',payment_date:'2026-01-01'}))).success);
  assert.match((await brokerActions.payBrokerCommission({},form({broker_id:broker.id,amount:1,method:'BANK',payment_date:'2026-01-01'}))).error,/exceeds/);
  await changeStatus('RETURNED');const reversed=logic.orderFinancials((await data.customerOrders(null,String(aOrder)))[0]);assert.equal(reversed.commission,0);assert.equal(reversed.brokerCommission,0);assert.equal(reversed.agentReturnDeduction,300);assert.equal(reversed.netCommission,-300);assert.equal(reversed.net,0);
  let agentBalance=department.agentPerformance(await data.customerOrders(Number(staff[1].id)),String(agents[0].id),0,'2026-10');assert.equal(agentBalance.returnDeductions,300);assert.equal(agentBalance.recovery,300);
  await changeStatus('RETURNED');agentBalance=department.agentPerformance(await data.customerOrders(Number(staff[1].id)),String(agents[0].id),0,'2026-10');assert.equal(agentBalance.returnDeductions,300);
  await changeStatus('RETURNED',{return_cost:100});agentBalance=department.agentPerformance(await data.customerOrders(Number(staff[1].id)),String(agents[0].id),0,'2026-10');assert.equal(agentBalance.returnDeductions,400);assert.equal(agentBalance.recovery,400);
  assert.equal(Number((await db.query('SELECT quantity_on_hand FROM batches WHERE id=$1',[batch.id])).rows[0].quantity_on_hand),100);
  assert.match((await departmentActions.recordCommissionPayout({},form({agent_id:agents[0].id,amount:1,method:'BANK',payment_date:'2026-01-01'}))).error,/exceeds/);
  console.log('PASS agent return dues, repeat-save idempotency, cost corrections and payout blocking');
  console.log('PASS trusted retail sales/broker rates, delivery split, broker payout limits and return reversal');
  identity={id:Number(staff[0].id),role:'ADMIN'};
  const email=randomUUID()+'@portal-check.invalid',initialPassword='Portal-check-initial-password!';
  assert.ok((await portal.createAgentPortalAccount({},form({full_name:'Private portal fixture',email,password:initialPassword,phone:'03000000000',commission_pct:15}))).success);
  const account=(await db.query('SELECT u.*,a.id AS agent_id FROM users u JOIN sales_agents a ON a.user_id=u.id WHERE u.email=$1',[email])).rows[0];assert.equal(account.role,'SALES');assert.ok(await bcrypt.compare(initialPassword,account.password_hash));
  assert.ok((await portal.resetAgentPortalPassword({},form({agent_id:account.agent_id,password:'Portal-check-reset-password!'}))).success);
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[account.id])).rows[0].session_version,1);
  identity={id:Number(account.id),role:'SALES'};profile={id:account.agent_id};
  assert.ok((await portal.resetAgentPortalPassword({},form({agent_id:agents[1].id,password:initialPassword}))).error);
  assert.ok((await portal.saveMyAgentProfile({},form({agent_id:agents[1].id,phone:'03001112222',address:'Own profile'}))).success);
  assert.equal((await db.query('SELECT phone FROM sales_agents WHERE id=$1',[agents[1].id])).rows[0].phone,'');
  assert.ok((await portal.changeMyAgentPassword({},form({current_password:'Portal-check-reset-password!',new_password:'Portal-check-own-new-password!',confirm_password:'Portal-check-own-new-password!'}))).success);
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[account.id])).rows[0].session_version,2);
  console.log('PASS separate agent logins, hashed passwords, admin reset, own profile updates and password-session revocation');
  console.log('Agent portal integration checks passed. All test business records are being rolled back.');
 }catch(e){console.error('Agent portal check failed:',e.message);process.exitCode=1;}finally{await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});}
})();
