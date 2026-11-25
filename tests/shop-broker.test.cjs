const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function load(p,imports={}){const exports={};new Function('require','exports',compile(p))(n=>Object.hasOwn(imports,n)?imports[n]:require(n),exports);return exports;}
const {shopBrokerFinancials,brokerCollectionAccount,shopBrokerSplit}=load('lib/shop-broker.ts');
const invoice={total:800,paid_total:500,credit_total:0,broker_pct:20,retail_net:1000};
test('broker earns its separate retail share in proportion to collections and full shop pending is a negative adjustment',()=>{
 const f=shopBrokerFinancials(invoice);assert.equal(f.earned,125);assert.equal(f.pendingDeduction,300);assert.equal(f.balance,-175);assert.equal(f.companyCollections,375);
 const none=shopBrokerFinancials({...invoice,paid_total:0});assert.equal(none.earned,0);assert.equal(none.balance,-800);
 const settled=shopBrokerFinancials({...invoice,paid_total:800});assert.equal(settled.earned,200);assert.equal(settled.pending,0);assert.equal(settled.balance,200);
});
test('collections, return credits and payment reversal update the same broker balance without double-counting',()=>{
 assert.equal(shopBrokerFinancials({...invoice,credit_total:200,retail_net:750}).balance,25);
 assert.equal(shopBrokerFinancials({...invoice,paid_total:0,credit_total:800,retail_net:0}).balance,0);
 assert.equal(shopBrokerFinancials({...invoice,paid_total:0}).balance,-800);
 assert.equal(shopBrokerFinancials(invoice).balance,shopBrokerFinancials(invoice).balance);
});
test('pending shop exposure offsets other broker earnings before payouts',()=>{
 const b=brokerCollectionAccount(250,[invoice],25);assert.equal(b.earned,375);assert.equal(b.pendingDeduction,300);assert.equal(b.due,50);assert.equal(b.recovery,0);
 const negative=brokerCollectionAccount(0,[invoice],0);assert.equal(negative.due,0);assert.equal(negative.recovery,175);
});
test('50 units show shop 20, broker 20 and combined 40 separately with matching amounts',()=>{
 const split=shopBrokerSplit([{quantity:50,retail:1295,shopPrice:1036,companyPrice:777,shopPct:20,brokerPct:20}]);
 assert.equal(split.retail,64750);assert.equal(split.shopAmount,12950);assert.equal(split.brokerAmount,12950);assert.equal(split.combinedAmount,25900);assert.equal(split.company,38850);assert.equal(split.shopInvoice,51800);assert.equal(split.shopPct,20);assert.equal(split.brokerPct,20);assert.equal(split.combinedPct,40);
 const {ShopBrokerSplitSummary}=load('components/ShopBrokerSplitSummary.tsx',{'@/lib/shop-broker':{shopBrokerSplit},'@/lib/utils':load('lib/utils.ts')});
 const html=renderToStaticMarkup(React.createElement(ShopBrokerSplitSummary,{lines:[{quantity:50,retail:1295,shopPrice:1036,companyPrice:777,shopPct:20,brokerPct:20}]}));
 for(const label of ['Shop discount','Broker share','Combined shop + broker','20.00% + 20.00% = 40.00%','12,950.00','25,900.00','38,850.00'])assert.ok(html.includes(label),label);
});
test('different product shop rates are weighted by retail value while each broker share stays separate',()=>{
 const split=shopBrokerSplit([{quantity:1,retail:1000,shopPrice:900,companyPrice:700,shopPct:10,brokerPct:20},{quantity:1,retail:2000,shopPrice:1400,companyPrice:1000,shopPct:30,brokerPct:20}]);
 assert.equal(split.shopPct.toFixed(2),'23.33');assert.equal(split.brokerPct,20);assert.equal(split.combinedPct.toFixed(2),'43.33');assert.equal(split.shopAmount,700);assert.equal(split.brokerAmount,600);assert.equal(split.combinedAmount,1300);
});
test('official shop invoice prints only the shop discount and excludes private broker and company allocation',async()=>{
 const utils=load('lib/utils.ts');
 const block=()=>null;
 let discountSteps={};
 let previousInvoices=[];
 const page=load('app/(admin)/invoices/[id]/print/page.tsx',{
  '@/lib/auth':{requireRole:async()=>({role:'ADMIN'})},'@/lib/utils':utils,'@/lib/invoice-discount':load('lib/invoice-discount.ts'),
  '@/lib/db':{query:async sql=>sql.includes('FROM invoices i')?[{id:1,invoice_no:'SHOP-1',issue_date:'2026-11-18',shop_name:'Shop Example',subtotal:1000,discount_total:200,total:800,paid_total:0,credit_total:0,outstanding:'800.00',previous_invoices:previousInvoices,previous_balance:'125.50',combined_balance:'925.50',broker_id:9,broker_pct:20,broker_name:'PRIVATE_BROKER_NAME'}]:sql.includes('FROM invoice_items')?[{id:1,product_name:'Product',quantity:1,retail_unit_price:1000,discount_pct:20,applied_unit_price:800,line_total:800,broker_discount_pct:20,company_unit_price:600,...discountSteps}]:[]},
  '@/components/InvoicePrintSlot':{InvoicePrintSlot:({children})=>children},'@/components/InvoiceBarcode':{InvoiceBarcode:block},'./invoice-print.css':{},
  '@/lib/invoice-dates':load('lib/invoice-dates.ts'),
  '@/components/BrandLogo':{BrandLogo:block},'@/components/InvoicePaymentNotice':{InvoicePaymentNotice:block},'@/lib/bank-settings':{bankSettings:async()=>({iban:''})},'@/components/BankDetails':{BankDetails:block},'@/components/PrintButton':{PrintButton:block},'next/navigation':{notFound:()=>{throw new Error('not found');}}
 });
 const render=async (mode,selection,include)=>renderToStaticMarkup(await page.default({
  params:Promise.resolve({id:'1'}),
  searchParams:Promise.resolve({mode,selection,include}),
 }));
 const html=await render();assert.match(html,/<th>1st Disc\. %<\/th><th>2nd Disc\. %<\/th>/);assert.match(html,/20\.00%/);assert.match(html,/800\.00/);assert.doesNotMatch(html,/PRIVATE_BROKER_NAME|Broker|broker|40\.00%|600\.00/);
 discountSteps={first_discount_pct:'10.00',second_discount_pct:'11.11'};
 assert.doesNotMatch(await render('combined'),/Combined invoice|COMBINED BALANCE DUE/);
 previousInvoices=[{id:'2',invoice_no:'SHOP-OLD',issue_date:'2026-11-10',balance:'125.50'}];
 const separateHtml=await render();
 assert.match(separateHtml,/Separate invoice/);
 assert.match(separateHtml,/href="\/invoices\/2\/print"/);
 assert.doesNotMatch(separateHtml,/COMBINED BALANCE DUE/);
 const combinedHtml=await render('combined');
 assert.match(combinedHtml,/<td>SHOP-OLD<\/td>/);
 assert.equal((combinedHtml.match(/COMBINED BALANCE DUE<\/span><b>Rs\. 925\.50/g)??[]).length,2);
 assert.match(combinedHtml,/Folio \(8\.5 × 13 in\), portrait/);
 previousInvoices.push({id:'3',invoice_no:'SHOP-OTHER',issue_date:'2026-11-11',balance:'10.25'});
 const selectedHtml=await render('combined','custom',['3','3','99']);
 assert.match(selectedHtml,/<td>SHOP-OTHER<\/td>/);
 assert.doesNotMatch(selectedHtml,/<td>SHOP-OLD<\/td>/);
 assert.match(selectedHtml,/COMBINED BALANCE DUE<\/span><b>Rs\. 810\.25/);
 assert.doesNotMatch(await render('combined','custom'),/COMBINED BALANCE DUE/);
 const splitHtml=await render();
 assert.equal((splitHtml.match(/<td>10\.00%<\/td><td>11\.11%<\/td>/g)??[]).length,2);
});

test('customer pending combines with shop pending, recovers on payment and closes on returns',()=>{
 const {brokerCustomerPending}=load('lib/shop-broker.ts');
 const o={status:'DELIVERED',retail_total:1000,shipping_charge:100,collected:700};
 assert.equal(brokerCustomerPending(o),400);
 const account=brokerCollectionAccount(200,[invoice],25,brokerCustomerPending(o));
 assert.equal(account.customerPending,400);assert.equal(account.shopPending,300);assert.equal(account.pendingDeduction,700);assert.equal(account.netBalance,-400);assert.equal(account.recovery,400);assert.equal(account.due,0);
 assert.equal(brokerCustomerPending({...o,collected:1100}),0);
 for(const status of ['RETURNED','CANCELLED'])assert.equal(brokerCustomerPending({...o,status}),0);
});

test('broker account shows invoice-level deductions and reconciled negative balance',async()=>{
 const shopLogic=load('lib/shop-broker.ts'),salesLogic=load('lib/sales-team.ts');
 const brokerPage=load('app/(admin)/sales-team/brokers/page.tsx',{
  '@/components/BrokerPayoutTable':{BrokerPayoutTable:()=>null},'@/components/PaymentReceiptInput':{PaymentReceiptInput:()=>null},'@/lib/broker-payment-time':load('lib/broker-payment-time.ts'),'@/lib/auth':{requireRole:async()=>({role:'ACCOUNTS'})},
  '@/lib/db':{query:async sql=>sql.includes('SELECT b.*')?[{id:9,full_name:'Example Broker',phone:'',email:'',commission_pct:20,active:true,paid:25}]:[{broker_id:9,broker_source:'SALES',amount:25,payment_date:'2026-10-26'}]},
  '@/lib/sales-team-data':{customerOrders:async()=>[{id:'12',broker_id:9,broker_name:'Example Broker',customer_name:'Unpaid Customer',status:'DELIVERED',retail_total:1000,shipping_charge:0,collected:700,product_cost:100,courier_cost:0,shipping_cost:0,return_cost:0,commission_pct:20,commission_basis:'RETAIL',broker_pct:20}]},
  '@/lib/shop-broker-data':{shopBrokerInvoices:async()=>[]},'@/lib/shop-broker':shopLogic,'@/lib/sales-team':salesLogic,'@/lib/utils':load('lib/utils.ts'),
  '@/components/DepartmentStats':{DepartmentStats:({items})=>React.createElement('div',null,items.map(([k,v])=>k+': '+v).join(' | '))},
  '@/components/DepartmentForm':{DepartmentForm:()=>null},'@/app/broker-actions':{}
 });
 const html=renderToStaticMarkup(await brokerPage.default({}));
 const shopHtml=renderToStaticMarkup(await brokerPage.default({searchParams:Promise.resolve({type:'SHOP'})}));
 assert.ok(shopHtml.includes('Shop brokers &amp; commission payouts'));assert.ok(!shopHtml.includes('Unpaid Customer'));assert.ok(!shopHtml.includes('CO-12'));assert.ok(!shopHtml.includes('-125.00'));
 for(const label of ['profit and pending deduction details','Unpaid Customer','CO-12','Less pending customer orders','Net broker balance','-125.00','300.00'])assert.ok(html.includes(label),label);
});
