const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>deps[name]||require(name),out);return out;}
const helper=load('lib/monthly-statement.ts');
const service=load('lib/monthly-financials.ts',{'./db':{},'./monthly-statement':helper});
const goods=[{invoice:'INV-NEW',date:'2020-09-12',shop:'Shop',product:'Serum',batch:'B1',quantity:30,unitCost:440,totalCost:13200,sales:26910}];
const expenses=[{reference:'EXP-1',date:'2020-09-15',title:'Rent',category:'Rent',note:'Receipt 123',staff:'Owner',amount:13000}];
const payments=[{id:'1',reference:'PAY-1',date:'2020-09-16',shop:'Shop',method:'CASH',bankReference:'',note:'Previous invoice payment',staff:'Owner',amount:8000,invoices:'INV-OLD'}];
test('profit deducts historical goods cost and each expense once, using actual collections',()=>{
 const f=service.financialTotals(goods,[],expenses,payments,null);assert.equal(f.netGoodsCost,13200);assert.equal(f.businessExpenses,13000);assert.equal(f.invoiceProfit,710);assert.equal(f.netProfit,-18200);assert.equal(f.received,8000);
 assert.equal(service.financialTotals(goods,[],expenses,[{...payments[0],amount:25000}],null).netProfit,-1200);
});
test('returns reverse goods cost while reducing revenue, including older invoice returns',()=>{
 const f=service.financialTotals(goods,[{reference:'RET-OLD',date:'2020-09-16',invoice:'INV-OLD',shop:'Shop',credit:897,reversedCost:440}],expenses,payments,null);
 assert.equal(f.netGoodsCost,12760);assert.equal(f.netProfit,-17760);
});
test('shop contribution does not deduct all unallocated business expenses',()=>{
 const f=service.financialTotals(goods,[],expenses,payments,'1');assert.equal(f.businessExpenses,13000);assert.equal(f.deductedExpenses,0);assert.equal(f.netProfit,-5200);
});
test('expense-only months produce a loss and no invented receipts or sales',()=>{
 const f=service.financialTotals([],[],expenses,[],null);assert.equal(f.netProfit,-13000);assert.equal(f.sales,0);assert.equal(f.received,0);
});
test('user example deducts unpaid sales and carries the negative result until collected',()=>{
 const base={scopeShop:null,from:'2026-10-01',through:'2026-10-31',sales:321090,returnCredits:0,dispatchedCost:151300,returnedCost:0,netGoodsCost:151300,businessExpenses:13000,deductedExpenses:13000,netProfit:156790,received:77130,goods:[],returns:[],expenses:[],payments:[],openingResult:0};
 const october=service.collectionClosing(base);assert.equal(october.netProfit,-87170);assert.equal(october.closingResult,-87170);assert.equal(base.netProfit,156790);
 const november={...base,from:'2026-11-01',through:'2026-11-30',sales:0,dispatchedCost:0,netGoodsCost:0,businessExpenses:0,deductedExpenses:0,received:0,openingResult:october.closingResult};
 assert.equal(service.collectionClosing(november).closingResult,-87170);
 assert.equal(service.collectionClosing({...november,received:50000}).closingResult,-37170);
 const paid=service.collectionClosing({...november,received:243960});assert.equal(paid.closingResult,156790);
 assert.equal(service.collectionClosing({...november,received:0,openingResult:paid.closingResult}).closingResult,156790);
});
test('legacy saved figures use collection logic without rewriting captured data',()=>{
 const saved={scopeShop:null,from:'2020-09-01',through:'2020-09-30',sales:26910,returnCredits:0,dispatchedCost:13200,returnedCost:0,netGoodsCost:13200,businessExpenses:13000,deductedExpenses:13000,netProfit:710,received:8000,goods:[],returns:[],expenses:[],payments:[]};
 const adjusted=service.collectionClosing(saved,{...saved,openingResult:-1000});assert.equal(adjusted.netProfit,-18200);assert.equal(adjusted.closingResult,-19200);assert.equal(saved.netProfit,710);
});
test('queries preserve date limits and keep expenses independent of shop filter',async()=>{
 const calls=[];const f=load('lib/monthly-financials.ts',{'./monthly-statement':helper,'./db':{query:async(sql,args)=>{calls.push({sql,args});return [];}}});
 await f.monthlyFinancials('2020-09','1');
 assert.equal(calls.length,5);for(const call of calls)assert.deepEqual(call.args,call.sql.includes('AS opening_result')?['2020-09-01','1','2020-08-01']:call.sql.includes('FROM expenses e')?['2020-09-01','2020-10-01']:['2020-09-01','2020-10-01','1']);
 assert.match(calls[0].sql,/ii.unit_cost/);assert.ok(!calls[0].sql.includes('p.manufacturer_price'));
});
test('expense-only complete closings save immutable financial snapshots and audit once',async()=>{
 let stored=null,audits=0;
 const finance={scopeShop:null,from:'2020-09-01',through:'2020-09-30',goods:[],returns:[],expenses,payments:[],...service.financialTotals([],[],expenses,[],null)};
 const {closeMonth}=load('app/monthly-closing-actions.ts',{
  '@/lib/auth':{requireRole:async()=>({id:7})},'@/lib/utils':load('lib/utils.ts'),'@/lib/monthly-statement':helper,
  '@/lib/monthly-closing':{liveMonthlyStatements:async()=>({statements:[]})},'@/lib/monthly-financials':{isCompleteFinancialSnapshot:service.isCompleteFinancialSnapshot,monthlyFinancials:async()=>finance},'next/cache':{revalidatePath:()=>{}},
  '@/lib/db':{transaction:async fn=>fn({query:async(sql,args)=>{if(sql.includes('INSERT INTO public.monthly_closing_documents')){if(stored)return {rows:[]};stored=JSON.parse(args[2]);return {rows:[{id:1}]};}if(sql.includes('INSERT INTO public.audit_logs'))audits++;return {rows:[]};}})},
 });
 const form=new FormData();form.set('month','2020-09');assert.match((await closeMonth({error:'',message:''},form)).message,/Complete financial closing/);
 finance.netProfit=99999;assert.match((await closeMonth({error:'',message:''},form)).message,/Existing saved summaries/);
 assert.equal(stored.financials.netProfit,-13000);assert.equal(stored.financials.expenses[0].amount,13000);assert.equal(audits,1);
});
