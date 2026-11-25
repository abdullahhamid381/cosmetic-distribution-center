const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {PDFDocument}=require('pdf-lib');
function load(file,dependencies={}){const result={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>dependencies[name]||require(name),result);return result;}
const {reportDocument,monthlyInvoiceSummary}=load('lib/report-document.ts',{'./utils':load('lib/utils.ts'),'./report-roi':load('lib/report-roi.ts')});
const {reportPdf}=load('lib/report-pdf.ts');
const {reportDocx}=load('lib/report-docx.ts');
test('monthly summary combines both channels and includes months with only local sales',()=>{
 const source={
  invoices:[{issue_date:'2026-10-23',total:1000,paid_total:700,credit_total:100,remaining:200}],
  localSales:[
   {date:'2026-10-25',original:400,sales:400,received:300,balance:100},
   {date:'2026-11-03',original:250,sales:0,received:50,balance:-50},
  ],
 };
 const combined=monthlyInvoiceSummary(source,true);
 assert.deepEqual(combined.rows,[
  ['2026-10','Rs. 1,000.00','Rs. 400.00','Rs. 1,400.00','Rs. 1,000.00','Rs. 100.00','Rs. 300.00'],
  ['2026-11','Rs. 0.00','Rs. 250.00','Rs. 250.00','Rs. 50.00','Rs. 250.00','Rs. -50.00'],
 ]);
 assert.equal(monthlyInvoiceSummary(source,false).rows.length,1);
});
test('business report lists shop, local, and combined profit in order',()=>{
 const model=reportDocument({
  ...data,totals:{original:1000,returns:0,received:800,remaining:200},
  shopGross:400,gross:600,expenses:50,profitSales:1500,profitPending:300,
  brokerCommission:{allocation:40,earned:30},
  local:{sales:500,cost:300,received:400,due:100,refundDue:0},localSales:[],
 },{shop:'',from:'',to:'',product:''},'All stores','Owner');
 assert.deepEqual(model.tables.slice(0,3).map(table=>table.title),[
  '1. Shop Profit Analysis','2. Local Customer Profit Analysis','3. Combined Shop and Local Customer Report',
 ]);
 const profit=model.tables[2].rows.slice(-2).map(([,value])=>value);
 assert.deepEqual(profit,['Rs. 510.00','Rs. 220.00']);
});
const data={
 invoices:Array.from({length:45},(_,i)=>({id:i+1,invoice_no:`INV-${String(i+1).padStart(6,'0')}`,shop_id:1,shop_name:'Haq Bahoo Cosmetics & Beauty Supplies',issue_date:'2026-10-23',due_date:'2026-11-22',total:'26910',paid_total:'5000',credit_total:'0',remaining:'21910',delivery_no:`DEL-${i+1}`})),
 totals:{original:1210950,received:225000,returns:0,remaining:985950},
 payments:[{payment_no:'PAY-000001',shop_name:'Haq Bahoo Cosmetics',payment_date:'2026-10-23',method:'BANK',reference:'BANK-REF-2026-001',amount:'5000'}],
 returns:[],expenses:13000,expenseDetails:[{id:'1',title:'Warehouse rent',category:'Rent',expense_date:'2026-10-23',amount:'13000',note:'Supplier reference RENT-001',recorded_by:'Business Owner'}],gross:350000,products:[{name:'Glanze Serum',sku:'GS-01',units:1350,returned_units:0,original:1210950,credits:0,trade_dispatch_cost:1210950,trade_return_cost:0,gross:350000}],
 productDetails:[{invoice_no:'INV-000001',issue_date:'2026-10-23',shop_name:'Haq Bahoo Cosmetics',name:'Glanze Serum',sku:'GS-01',batch_number:'BATCH-2026-001',units:30,returned_units:0,trade_unit_price:897,dispatch_unit_price:897,net_value:26910,trade_dispatch_cost:26910,trade_return_cost:0,unit_cost:440,net_cost:13200}],
};
const filters={shop:'',from:'2026-10-01',to:'2026-10-23',product:'',error:''};
const model=reportDocument(data,filters,'All stores','Business Owner',new Date('2026-10-23T05:30:00Z'));

test('export model preserves report totals, dates and all register rows',()=>{
 assert.equal(model.metrics[0].value,'Rs. 1,210,950.00');assert.equal(model.tables.find(t=>t.title==='Invoice register').rows.length,45);
 assert.equal(model.tables.find(t=>t.title==='Profit analysis').rows.at(-1)[1],'Rs. -648,950.00');
 assert.match(model.generated,/23 Oct 2026/);assert.match(model.generated,/PKT/);
 const expense=model.tables.find(t=>t.title==='Expense register');assert.equal(expense.rows[0][0],'EXP-1\n2026-10-23');assert.equal(expense.rows[0][3],'Business Owner');assert.equal(expense.rows[0][5],'Rs. 13,000.00');
 for(const table of model.tables){assert.equal(table.widths.reduce((a,b)=>a+b),100);for(const row of table.rows)assert.equal(row.length,table.headers.length);}
});
test('store profit excludes unallocated business expenses and describes product scope',()=>{
 const store=reportDocument(data,{...filters,shop:'1',product:'1'},'Haq Bahoo Cosmetics','Owner');
 assert.equal(store.tables.find(t=>t.title==='Profit analysis').rows[2][1],'Rs. 0.00');
 assert.ok(store.notes.some(n=>n.includes('product filter')));
});
test('PDF generates branded multipage report and empty report without errors',async()=>{
 const bytes=await reportPdf(model),pdf=await PDFDocument.load(bytes);
 assert.equal(pdf.getTitle(),'HH MEDICS Business Report');assert.ok(pdf.getPageCount()>=3);
 assert.ok(pdf.getPages().every(p=>p.getWidth()===612&&p.getHeight()===1008));
 const empty=await reportPdf({...model,tables:model.tables.map(t=>({...t,rows:[]}))});assert.ok((await PDFDocument.load(empty)).getPageCount()>0);
 if(process.env.REPORT_EXPORT_QA){fs.mkdirSync('.tmp/report-export-qa',{recursive:true});fs.writeFileSync('.tmp/report-export-qa/business-report.pdf',bytes);}
});
test('Word generates an actual DOCX archive',async()=>{
 const bytes=await reportDocx(model);assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>10000);
 const zip=await require('jszip').loadAsync(bytes),xml=await zip.file('word/document.xml').async('string');
 assert.match(xml,/w:orient="portrait"/);assert.match(xml,/w:tblHeader/);assert.match(xml,/INV-000045/);assert.match(xml,/Financial summary/);
 assert.match(xml,/<w:pgSz\b(?=[^>]*w:w="12240")(?=[^>]*w:h="20160")/);
 assert.ok(zip.file('word/header1.xml'));assert.ok(zip.file('word/footer1.xml'));
 const footer=await zip.file('word/footer1.xml').async('string');
 assert.ok(footer.includes(`Generated: ${model.generated}`));assert.match(footer,/PAGE/);assert.match(footer,/NUMPAGES/);
 if(process.env.REPORT_EXPORT_QA){fs.mkdirSync('.tmp/report-export-qa',{recursive:true});fs.writeFileSync('.tmp/report-export-qa/business-report.docx',bytes);}
});

test('monthly closing PDF and Word preserve prior and current balance detail',async()=>{
 const helpers=load('lib/monthly-statement.ts');
 const {monthlyReportDocument}=load('lib/monthly-report-document.ts',{'./utils':load('lib/utils.ts'),'./monthly-financials':load('lib/monthly-financials.ts',{'./db':{},'./monthly-statement':helpers})});
 const statements=helpers.buildMonthlyStatements([
  {id:'1',invoice_no:'INV-PREVIOUS',shop_id:'1',shop_name:'Haq Bahoo Cosmetics',issue_date:'2026-09-10',original:'30000',opening:'20000',received:'5000',credits:'0',closing:'15000'},
  {id:'2',invoice_no:'INV-CURRENT',shop_id:'1',shop_name:'Haq Bahoo Cosmetics',issue_date:'2026-10-10',original:'26910',opening:'0',received:'3000',credits:'0',closing:'23910'},
 ],'2026-10',new Map([['1',20000]]));
 const finance={scopeShop:null,from:'2026-10-01',through:'2026-10-23',sales:26910,returnCredits:0,dispatchedCost:13200,returnedCost:0,netGoodsCost:13200,businessExpenses:13000,deductedExpenses:13000,netProfit:710,received:8000,goods:[{invoice:'INV-CURRENT',date:'2026-10-10',shop:'Haq Bahoo Cosmetics',product:'Glanze Serum',batch:'BATCH-001',quantity:30,unitCost:440,totalCost:13200,sales:26910}],returns:[],expenses:[{reference:'EXP-1',date:'2026-10-15',title:'Warehouse rent',category:'Rent',note:'Supplier receipt RENT-001',staff:'Business Owner',amount:13000}],payments:[{id:'1',reference:'PAY-1',date:'2026-10-20',shop:'Haq Bahoo Cosmetics',method:'BANK',bankReference:'BANK-1',note:'Part payment',staff:'Business Owner',amount:8000,invoices:'INV-PREVIOUS (5000), INV-CURRENT (3000)'}]};
 const report=monthlyReportDocument(statements,'2026-10','Business Owner','All shops','Live statement through 23 October 2026.',new Date('2026-10-23T05:00:00Z'),finance);
 assert.equal(report.metrics.find(m=>m.label==='Closing balance carried forward').value,'Rs. -38,910.00');assert.equal(report.metrics.find(m=>m.label==='Closing result after carry forward').value,'Rs. -18,200.00');
 for(const t of report.tables)assert.equal(t.widths.reduce((a,b)=>a+b),100);
 const bytes=await reportPdf(report),word=await reportDocx(report);
 const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getTitle(),'HH MEDICS Monthly Closing');
 const zip=await require('jszip').loadAsync(word),xml=await zip.file('word/document.xml').async('string');assert.match(xml,/INV-PREVIOUS/);assert.match(xml,/INV-CURRENT/);assert.match(xml,/38,910.00/);assert.match(xml,/Warehouse rent/);assert.match(xml,/-18,200.00/);assert.match(xml,/carried forward/);
 if(process.env.REPORT_EXPORT_QA){fs.mkdirSync('.tmp/report-export-qa',{recursive:true});fs.writeFileSync('.tmp/report-export-qa/monthly-closing.pdf',bytes);fs.writeFileSync('.tmp/report-export-qa/monthly-closing.docx',word);}
});

test('download route validates format and filters before generating a document',async()=>{
 const {NextRequest}=require('next/server');let reads=0;
 const realFilters=load('lib/report-data.ts',{'./db':{},'./shop-broker':load('lib/shop-broker.ts'),'./invoice-discount':load('lib/invoice-discount.ts')}).reportFilters;
 const {GET}=load('app/api/reports/download/route.ts',{
  '@/lib/auth':{requireRole:async()=>({name:'Owner'})},'@/lib/db':{query:async()=>[]},
  '@/lib/report-data':{reportFilters:realFilters,businessReport:async()=>{reads++;return data;}},
  '@/lib/report-document':{reportDocument},
 });
 for(const query of ['format=exe','format=pdf&from=2026-02-30','format=docx&from=2026-12-01&to=2026-01-01']){
  const response=await GET(new NextRequest('http://localhost/api/reports/download?'+query));assert.equal(response.status,400);
 }assert.equal(reads,0);
});

test('download route returns correct file formats and preserves selected filters',async()=>{
 const {NextRequest}=require('next/server');
 const realFilters=load('lib/report-data.ts',{'./db':{},'./shop-broker':load('lib/shop-broker.ts'),'./invoice-discount':load('lib/invoice-discount.ts')}).reportFilters;
 const {GET}=load('app/api/reports/download/route.ts',{
  '@/lib/auth':{requireRole:async()=>({name:'Owner'})},'@/lib/db':{query:async sql=>sql.includes('shop_name')?[{shop_name:'Store One'}]:[{id:'2'}]},
  '@/lib/report-data':{reportFilters:realFilters,businessReport:async filters=>{assert.equal(filters.shop,'1');assert.equal(filters.product,'2');assert.equal(filters.from,'2026-10-01');return data;}},
  '@/lib/report-document':{reportDocument},'@/lib/report-pdf':{reportPdf},'@/lib/report-docx':{reportDocx},
 });
 for(const format of ['pdf','docx']){
  const response=await GET(new NextRequest(`http://localhost/api/reports/download?format=${format}&shop=1&product=2&from=2026-10-01`));
  assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),new RegExp(`\\.${format}"$`));
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.match(response.headers.get('content-type'),format==='pdf'?/application\/pdf/:/wordprocessingml/);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,format==='pdf'?4:2).toString(),format==='pdf'?'%PDF':'PK');
 }
});

test('profit exports deduct retail broker commission once and show the net after commission',()=>{
 const withBroker=reportDocument({...data,gross:19980,expenses:0,totals:{original:31080,returns:0,remaining:0},brokerCommission:{allocation:7770,earned:7770},brokerDetails:[]},filters,'All stores','Owner');
 const rows=withBroker.tables.find(t=>t.title==='Profit analysis').rows;
 assert.equal(rows.find(r=>r[0]==='Less broker commission on retail after returns')[1],'Rs. 7,770.00');
 assert.equal(rows.find(r=>r[0]==='My net profit if all shops pay')[1],'Rs. 12,210.00');
 assert.equal(rows.at(-1)[1],'Rs. 12,210.00');
});


test('report exports retain saved invoice and product shop percentages without altering profit scope',()=>{
 const withPercentages=reportDocument({...data,
  invoices:[{...data.invoices[0],shop_discount_percentage:'20.00%'},{...data.invoices[1],shop_discount_percentage:'25.00% overall'}],
  productDetails:[{...data.productDetails[0],discount_pct:'20.00'},{...data.productDetails[0],discount_pct:0}],
 },filters,'All stores','Owner');
 const invoiceTable=withPercentages.tables.find(t=>t.title==='Invoice register'),invoiceIndex=invoiceTable.headers.indexOf('Shop discount %');
 assert.equal(invoiceTable.rows[0][invoiceIndex],'20.00%');assert.equal(invoiceTable.rows[1][invoiceIndex],'25.00% overall');assert.match(invoiceTable.note,/mixed item rates/);
 const productTable=withPercentages.tables.find(t=>t.title==='Product invoice pricing'),productIndex=productTable.headers.indexOf('Shop discount %');
 assert.equal(productTable.rows[0][productIndex],'20.00%');assert.equal(productTable.rows[1][productIndex],'0.00%');
 for(const table of [invoiceTable,productTable]){assert.equal(table.widths.reduce((sum,w)=>sum+w),100);for(const row of table.rows)assert.equal(row.length,table.headers.length);}
 assert.deepEqual(withPercentages.tables.find(t=>t.title==='Profit analysis'),model.tables.find(t=>t.title==='Profit analysis'));
 assert.deepEqual(withPercentages.tables.find(t=>t.title==='Broker commission by invoice'),model.tables.find(t=>t.title==='Broker commission by invoice'));
 assert.equal(withPercentages.metrics.find(m=>m.label==='ROI if all shops pay').value,model.metrics.find(m=>m.label==='ROI if all shops pay').value);
 const originalInvoice=model.tables.find(t=>t.title==='Invoice register'),originalProduct=model.tables.find(t=>t.title==='Product invoice pricing');
 assert.equal(originalInvoice.rows[0][originalInvoice.headers.indexOf('Shop discount %')],'Not recorded');assert.equal(originalProduct.rows[0][originalProduct.headers.indexOf('Shop discount %')],'Not recorded');
 assert.doesNotMatch(JSON.stringify(withPercentages),/NaN/);
});
