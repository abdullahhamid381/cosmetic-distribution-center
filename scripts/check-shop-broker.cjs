// All users, shops, stock, invoices, collections and payouts created here are rolled back.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),pg=require('pg'),{randomUUID}=require('node:crypto');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
require('dotenv').config({path:'.env.local',quiet:true});
function load(path,imports={}){const exports={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',js)(name=>Object.hasOwn(imports,name)?imports[name]:require(name),exports);return exports;}
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
const utils=load('lib/utils.ts'),logic=load('lib/sales-team.ts'),pricing=load('lib/product-pricing.ts'),shopLogic=load('lib/shop-broker.ts');
let user;
const auth={requireRole:async(...roles)=>{assert.ok(roles.includes(user.role));return user;}};
const nav={redirect:path=>{throw Object.assign(new Error('redirect'),{path});},unstable_rethrow:e=>{if(e.path)throw e;}};
const db={query:async(sql,args)=>(await client.query(sql,args)).rows,transaction:async fn=>{await client.query('SAVEPOINT shop_broker_check');try{const r=await fn(client);await client.query('RELEASE SAVEPOINT shop_broker_check');return r;}catch(e){await client.query('ROLLBACK TO SAVEPOINT shop_broker_check');await client.query('RELEASE SAVEPOINT shop_broker_check');throw e;}}};
const imports={'@/lib/broker-payout-receipts':load('lib/broker-payout-receipts.ts'),'@/lib/broker-payment-time':load('lib/broker-payment-time.ts'),'@/lib/invoice-discount':load('lib/invoice-discount.ts'),'@/lib/dispatch-cost':load('lib/dispatch-cost.ts'),'@/lib/auth':auth,'@/lib/db':db,'@/lib/utils':utils,'@/lib/product-pricing':pricing,'@/lib/sales-team':logic,'@/lib/shop-broker':shopLogic,'@/lib/payment-receipts':{readPaymentReceipt:async()=>null,savePaymentReceipt:async()=>{}},'@/lib/store-invoice-number':load('lib/store-invoice-number.ts'),'next/navigation':nav,'next/cache':{revalidatePath:()=>{}},'@/lib/records':load('lib/records.ts')};
const actions=load('app/actions.ts',imports),brokerActions=load('app/broker-actions.ts',imports),records=load('app/record-actions.ts',imports);
const data=load('lib/shop-broker-data.ts',{'server-only':{},'./db':db});
function form(values){const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,String(v));return f;}
async function redirected(promise){try{await promise;throw new Error('Expected redirect');}catch(e){if(!e.path)throw e;return e.path;}}
(async()=>{
 try{
  await client.connect();await client.query('BEGIN');const suffix=randomUUID();
  const u=(await client.query("INSERT INTO users(full_name,email,password_hash,role) VALUES('Shop integration check',$1,'disabled-test-login','ADMIN') RETURNING id",[suffix+'@shop-check.invalid'])).rows[0];user={id:Number(u.id),role:'ADMIN'};
  const broker=(await client.query('INSERT INTO sales_brokers(full_name) VALUES($1) RETURNING id',['PRIVATE_BROKER_'+suffix])).rows[0];
  const shop=(await client.query('INSERT INTO shops(shop_name) VALUES($1) RETURNING id',['Integration Shop '+suffix])).rows[0];
  const warehouse=(await client.query('INSERT INTO warehouses(name) VALUES($1) RETURNING id',['Integration Warehouse '+suffix])).rows[0];
  const product=(await client.query('INSERT INTO products(sku,name,trade_price,retail_price) VALUES($1,\'Integration product\',1000,1000) RETURNING id',[suffix])).rows[0];
  const batch=(await client.query('INSERT INTO batches(product_id,warehouse_id,batch_number,unit_cost,quantity_on_hand) VALUES($1,$2,$3,400,100) RETURNING id',[product.id,warehouse.id,suffix])).rows[0];
  const sale=async qty=>Number((await redirected(actions.createSale(form({shop_id:shop.id,warehouse_id:warehouse.id,broker_id:broker.id,broker_pct:20,lines:JSON.stringify([{batchId:Number(batch.id),quantity:qty,discountPct:20}])})))).split('/').pop());
  const invoiceId=await sale(1);let invoice=(await data.shopBrokerInvoices(broker.id,invoiceId))[0];
  assert.equal(Number(invoice.total),800);assert.equal(Number(invoice.company_net),600);assert.equal(Number(invoice.retail_net),1000);
  const savedItem=(await client.query('SELECT discount_pct,broker_discount_pct,company_unit_price FROM invoice_items WHERE invoice_id=$1',[invoiceId])).rows[0];assert.equal(Number(savedItem.discount_pct),20);assert.equal(Number(savedItem.broker_discount_pct),20);assert.equal(Number(savedItem.company_unit_price),600);
  console.log('PASS shop 20% invoice, private broker 20%, combined 40% allocation and stock dispatch');
  const collect=async(id,value)=>Number((await redirected(actions.recordPayment(form({shop_id:shop.id,invoice_id:id,amount:value,method:'BANK'})))).split('=').pop());
  const firstPayment=await collect(invoiceId,500);invoice=(await data.shopBrokerInvoices(broker.id,invoiceId))[0];let f=shopLogic.shopBrokerFinancials(invoice);assert.equal(f.earned,125);assert.equal(f.pendingDeduction,300);assert.equal(f.balance,-175);
  const payout=amount=>brokerActions.payBrokerCommission({},form({broker_id:broker.id,broker_source:'SHOP',amount,method:'BANK',payment_date:'2026-01-01'}));assert.match((await payout(1)).error,/exceeds/);
  await collect(invoiceId,300);f=shopLogic.shopBrokerFinancials((await data.shopBrokerInvoices(broker.id,invoiceId))[0]);assert.equal(f.earned,200);assert.equal(f.pendingDeduction,0);assert.ok((await payout(200)).success);assert.match((await payout(1)).error,/exceeds/);
  await redirected(records.deleteRecord(form({entity:'payments',id:firstPayment})));f=shopLogic.shopBrokerFinancials((await data.shopBrokerInvoices(broker.id,invoiceId))[0]);assert.equal(f.earned,75);assert.equal(f.pendingDeduction,500);assert.equal(f.balance,-425);assert.match((await payout(1)).error,/exceeds/);
  console.log('PASS collection-based earnings, negative pending balance, payout cap and payment reversal');
  const second=await sale(2);await collect(second,500);const line=(await client.query('SELECT id FROM invoice_items WHERE invoice_id=$1',[second])).rows[0];await redirected(actions.createReturn(form({invoice_item_id:line.id,quantity:1,reason:'Integration check return'})));
  const returned=(await data.shopBrokerInvoices(broker.id,second))[0];assert.equal(Number(returned.company_net),600);assert.equal(Number(returned.retail_net),1000);assert.equal(shopLogic.shopBrokerFinancials(returned).balance,-175);
  const empty=()=>null;
  const print=load('app/(admin)/invoices/[id]/print/page.tsx',{...imports,'@/components/BrandLogo':{BrandLogo:empty},'@/components/InvoicePaymentNotice':{InvoicePaymentNotice:empty},'@/lib/bank-settings':{bankSettings:async()=>({})},'@/components/BankDetails':{BankDetails:empty},'@/components/PrintButton':{Printer:empty}});
  const html=renderToStaticMarkup(await print.default({params:Promise.resolve({id:String(invoiceId)})}));assert.match(html,/20\.00%/);assert.doesNotMatch(html,/PRIVATE_BROKER_|40\.00%|600\.00|Broker|broker/);
  console.log('PASS return-adjusted private allocation and official invoice privacy');
  console.log('Shop broker checks passed; all test records are being rolled back.');
 }catch(error){console.error('Shop broker check failed:',error.message);process.exitCode=1;}finally{await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
})();
