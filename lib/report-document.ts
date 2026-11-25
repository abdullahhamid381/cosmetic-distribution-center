import {reportRoi,roiLabel} from './report-roi';
import type {businessReport,reportFilters} from './report-data';
import {money} from './utils';

export type ReportTable={title:string;note?:string;headers:string[];widths:number[];rows:string[][];
 barcode?:ReturnType<typeof import('./invoice-barcode').invoiceBarcode>;
 invoiceTotals?:{subtotal:string;discount:string;total:string;paid:string;credits:string;balance:string}};
export type ReportDocument={title:string;scope:string;period:string;generated:string;preparedBy:string;metrics:{label:string;value:string}[];notes:string[];tables:ReportTable[]};
const text=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value);
const cash=(value:unknown)=>money(Number(value||0));
const date=(value:unknown)=>value?String(value).slice(0,10):'—';

const percentage=(value:unknown)=>value===null||value===undefined||String(value).trim()===''||!Number.isFinite(Number(value))?'Not recorded':Number(value).toFixed(2)+'%';

export function salesProfitSections(data:Awaited<ReturnType<typeof businessReport>>):ReportTable[]{
 const shopSales=data.totals.original-data.totals.returns;
 const localProfit=data.local.sales-data.local.cost;
 const expenses=data.expenses;
 const rows=(entries:[string,number][])=>entries.map(([label,value])=>[label,cash(value)]);
 const headers=['Measure','Amount'],widths=[72,28];
 return [
  {title:'1. Shop Profit Analysis',headers,widths,note:'Business-wide expenses are deducted in the combined result.',rows:rows([
   ['Net shop sales',shopSales],['Cost of goods sold',shopSales-data.shopGross],['Shop collections',data.totals.received],['Shop balance due',data.totals.remaining],
   ['Broker commission on all sales',data.brokerCommission.allocation],['Broker commission released',data.brokerCommission.earned],
   ['Profit / loss if all shops pay',data.shopGross-data.brokerCommission.allocation],
   ['Profit / loss from payments received',data.shopGross-data.totals.remaining-data.brokerCommission.earned],
  ])},
  {title:'2. Local Customer Profit Analysis',headers,widths,note:'Business-wide expenses are deducted in the combined result.',rows:rows([
   ['Net local sales',data.local.sales],['Local sale costs',data.local.cost],['Net collections',data.local.received],
   ['Customer balance due',data.local.due],['Refunds due',data.local.refundDue],
   ['Profit / loss on local sales',localProfit],['Profit / loss from payments received',data.local.received-data.local.cost],
  ])},
  {title:'3. Combined Shop and Local Customer Report',headers,widths,rows:rows([
   ['Total net sales',data.profitSales],['Total costs after returns',data.profitSales-data.gross],
   ['Total net collections',data.totals.received+data.local.received],['Total customer balances due',data.totals.remaining+data.local.due],
   ['Refunds due',data.local.refundDue],['Business expenses',expenses],
   ['Broker commission on all sales',data.brokerCommission.allocation],['Broker commission released',data.brokerCommission.earned],
   ['Net profit / loss if all customers pay',data.gross-expenses-data.brokerCommission.allocation],
   ['Net profit / loss from payments received',data.gross-data.profitPending-expenses-data.brokerCommission.earned],
  ])},
 ];
}

export function monthlyInvoiceSummary(data:Awaited<ReturnType<typeof businessReport>>,includeLocal:boolean):ReportTable{
 const months=new Map<string,{shop:number;local:number;received:number;returns:number;remaining:number}>();
 function totals(month:string){
  const existing=months.get(month);
  if(existing)return existing;
  const entry={shop:0,local:0,received:0,returns:0,remaining:0};
  months.set(month,entry);
  return entry;
 }
 for(const invoice of data.invoices){
  const month=totals(date(invoice.issue_date).slice(0,7));
  month.shop+=Number(invoice.total);
  month.received+=Number(invoice.paid_total);
  month.returns+=Number(invoice.credit_total);
  month.remaining+=Number(invoice.remaining);
 }
 for(const sale of includeLocal?(data.localSales??[]):[]){
  const month=totals(sale.date.slice(0,7));
  month.local+=sale.original;
  month.received+=sale.received;
  month.returns+=sale.original-sale.sales;
  month.remaining+=sale.balance;
 }
 return {
  title:includeLocal?'Combined Monthly Invoice Summary':'Monthly Invoice Summary',
  note:includeLocal?'Grouped by shop invoice date or local sale date. Collections and returns are recorded to date. A negative balance indicates net refunds due.':'Grouped by invoice issue month. Payments and returns are allocated totals to date.',
  headers:includeLocal?['Month','Shop invoices','Local sales','Combined sales','Net collected','Returns','Net balance']:['Month','Invoiced','Received','Returns','Remaining'],
  widths:includeLocal?[12,14,14,15,15,14,16]:[20,20,20,20,20],
  rows:[...months.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([month,v])=>[month,...(includeLocal?[cash(v.shop),cash(v.local)]:[]),cash(v.shop+v.local),cash(v.received),cash(v.returns),cash(v.remaining)]),
 };
}

export function reportDocument(data:Awaited<ReturnType<typeof businessReport>>,filters:ReturnType<typeof reportFilters>,store:string,preparedBy:string,now=new Date()):ReportDocument{
 const stores=new Map<string,{name:string;count:number;original:number;received:number;returns:number;remaining:number}>();
 for(const i of data.invoices){
  const key=String(i.shop_id),s=stores.get(key)||{name:String(i.shop_name),count:0,original:0,received:0,returns:0,remaining:0};
  s.count++;s.original+=Number(i.total);s.received+=Number(i.paid_total);s.returns+=Number(i.credit_total);s.remaining+=Number(i.remaining);stores.set(key,s);
 }
 const profitSales=data.profitSales??(Number(data.totals.original)-Number(data.totals.returns));
 const profitPending=data.profitPending??Number(data.totals.remaining);
 const localIncluded=!!data.local&&[data.local.sales,data.local.cost,data.local.received].some(value=>value!==0);
 const expenses=filters.shop?0:data.expenses,profit=data.gross-expenses,broker=data.brokerCommission||{allocation:0,earned:0};
 const roi=reportRoi({sales:profitSales,gross:data.gross,expenses,pending:profitPending,brokerFull:broker.allocation,brokerReleased:broker.earned});
 return {
  title:'Business report',scope:store,period:`${filters.from||'Beginning'} to ${filters.to||'Latest'}`,
  generated:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'}).format(now)+' PKT',preparedBy,
  metrics:[{label:'Original invoice amount',value:cash(data.totals.original)},{label:'Payments allocated to invoices',value:cash(data.totals.received)},{label:'Return credits against invoices',value:cash(data.totals.returns)},{label:'Outstanding invoice balance',value:cash(data.totals.remaining)},{label:'Invoices in selection',value:String(data.invoices.length)},{label:'Stores with invoices',value:String(stores.size)},{label:'Cost investment after returns',value:cash(roi.investment)},{label:localIncluded?'ROI if all customers pay':'ROI if all shops pay',value:roiLabel(roi.expectedRoi)},{label:'ROI from payments received',value:roiLabel(roi.receivedRoi)}],
  notes:[
   'ROI = net profit after broker commission divided by product costs after returns plus applicable expenses, multiplied by 100. N/A means zero recorded cost investment. Broker payouts are not deducted twice.',
   'All monetary amounts are in Pakistani rupees (PKR). Both filter dates are inclusive. Blank dates mean an open-ended range.',
   'Invoice balances use invoice issue dates. Allocated payments and return credits include activity recorded to date, including after the selected invoice period. Return credits reduce debt; they are not cash refunds.',
   'Receipt and return registers use their own transaction dates. Received receipts can relate to older invoices, so their totals may differ from invoice allocations.',
   ...(filters.product?['A product filter applies only to the product sections. Invoice totals, store balances and profit include all products on the selected invoices.']:[]),
   ...(filters.shop?['Business expenses are not assigned to individual stores and are excluded from this store profit view.']:[]),
  ],
  tables:[
   ...(!filters.shop&&data.local?salesProfitSections(data):[]),
   ...(!filters.shop&&data.local?[{title:'Local Customer Sales Summary',headers:['Measure','Value'],widths:[70,30],rows:[['Sales recorded',String(data.localSales?.length??0)],['Net sales',cash(data.local.sales)],['Costs',cash(data.local.cost)],['Profit / loss',cash(data.local.sales-data.local.cost)],['Net collected',cash(data.local.received)],['Customer balance due',cash(data.local.due)],['Refunds due',cash(data.local.refundDue)]]}]:[]),
   ...(!filters.shop&&data.localSales?[{title:'Local Customer Sales',note:'Sale dates follow the report filter. Net collections include refunds recorded to date. A negative balance is a refund due.',headers:['Sale / Date','Customer / Status','Sale amount','Net sales','Costs','Net collected','Balance','Profit / loss'],widths:[13,19,11,11,11,12,11,12],rows:data.localSales.map(sale=>[`CO-${sale.id}\n${sale.date}`,[sale.customer,sale.phone,sale.status,sale.products].filter(Boolean).join('\n'),cash(sale.original),cash(sale.sales),cash(sale.cost),cash(sale.received),cash(sale.balance),cash(sale.profit)])}]:[]),
   {title:'Store balance summary',headers:['Store','Invoices','Invoiced','Received','Returns','Remaining'],widths:[25,7,17,17,17,17],rows:[...stores.values()].map(s=>[s.name,String(s.count),cash(s.original),cash(s.received),cash(s.returns),cash(s.remaining)])},
   {title:'Invoice register',note:'Shop discount uses saved product rates. An overall percentage identifies an invoice with mixed item rates; the individual rates appear in Product invoice pricing.',headers:['Invoice / Store','Issued / Due','Shop discount %','Invoiced','Received','Returns','Remaining','Delivery / Status'],widths:[21,14,12,11,10,10,10,12],rows:data.invoices.map(i=>[`${i.invoice_no}\n${i.shop_name}`,`${date(i.issue_date)}\nDue ${date(i.due_date)}`,i.shop_discount_percentage?String(i.shop_discount_percentage):'Not recorded',cash(i.total),cash(i.paid_total),cash(i.credit_total),cash(i.remaining),`${text(i.delivery_no)}\n${i.overdue?'Overdue':Number(i.remaining)?'Payment pending':'Settled'}`])},
   {title:'Payment receipts',note:'Actual payments dated in the selected range. Total received: '+cash(data.payments.reduce((sum,p)=>sum+Number(p.amount),0)),headers:['Receipt','Store','Date','Method / Reference','Amount'],widths:[18,25,14,25,18],rows:data.payments.map(p=>[text(p.payment_no),text(p.shop_name),date(p.payment_date),`${text(p.method)}\n${text(p.reference)}`,cash(p.amount)])},
   {title:'Return register',note:'Returns recorded during the selected dates. Total credit: '+cash(data.returns.reduce((sum,r)=>sum+Number(r.total_credit),0)),headers:['Return','Store','Date','Invoice','Reason','Credit'],widths:[15,21,13,16,19,16],rows:data.returns.map(r=>[text(r.return_no),text(r.shop_name),date(r.return_date),text(r.invoice_no),text(r.reason),cash(r.total_credit)])},
   {title:'Expense register',note:`Business-wide expenses dated in the selected range. Total: ${cash(data.expenses)}. Store and product filters do not restrict expenses; expenses are not allocated to an individual store.`,headers:['Voucher / Date','Expense','Category','Recorded by','Notes / References','Amount'],widths:[16,22,12,15,21,14],rows:data.expenseDetails.map(e=>[`EXP-${e.id}\n${date(e.expense_date)}`,text(e.title),text(e.category),text(e.recorded_by),text(e.note),cash(e.amount)])},
   {title:'Profit analysis',note:'Historical product costs are deducted. The received-payment figure also excludes money still owed by shops; it is not a cash ledger balance.',headers:['Calculation','Amount'],widths:[75,25],rows:[...(!filters.shop&&data.local?[['Local sales after returns',cash(data.local.sales)]]:[]),['Sales after returns',cash(profitSales)],['Sales costs after returns',cash(profitSales-data.gross)],['Business expenses'+(filters.shop?' (not allocated to store)':''),cash(expenses)],['Profit before broker commission',cash(profit)],['Less broker commission on retail after returns',cash(broker.allocation)],[localIncluded?'My net profit if all customers pay':'My net profit if all shops pay',cash(profit-broker.allocation)],[localIncluded?'Less net outstanding customer balance':'Less outstanding invoice balance',cash(profitPending)],['Add back broker commission not yet released',cash(broker.allocation-broker.earned)],['Broker commission released on payments received',cash(broker.earned)],['Profit from payments received',cash(profit-profitPending-broker.earned)]]},
   {title:'Broker commission by invoice',headers:['Invoice / Shop','Broker','Retail after returns','Rate','Full commission','Released'],widths:[24,20,16,8,16,16],rows:(data.brokerDetails||[]).map(i=>[`${i.invoice_no} / ${i.shop_name}`,text(i.broker_name),cash(i.retail),Number(i.broker_pct).toFixed(2)+'%',cash(i.allocation),cash(i.earned)])},
   {title:'Product distribution summary',note:'Net units and values deduct returns recorded to date against selected invoices.',headers:['Product / SKU','Sent units','Returned','Net units','Net sales','Net trade cost','Product profit'],widths:[26,9,9,9,16,16,15],rows:data.products.map(p=>[`${p.name}\n${p.sku}`,text(p.units),text(p.returned_units),text(Number(p.units)-Number(p.returned_units)),cash(Number(p.original)-Number(p.credits)),cash(Number(p.trade_dispatch_cost)-Number(p.trade_return_cost)),cash(p.gross)])},
   {title:'Product invoice pricing',headers:['Invoice / Date','Store','Product / Batch','Sent','Returned','Shop discount %','Trade unit price','Shop unit price','Net sales'],widths:[15,13,21,6,7,10,9,9,10],rows:data.productDetails.map(p=>[`${p.invoice_no}\n${date(p.issue_date)}`,text(p.shop_name),`${p.name}\n${p.sku} / ${p.batch_number}`,text(p.units),text(p.returned_units),percentage(p.discount_pct),cash(p.trade_unit_price),cash(p.dispatch_unit_price),cash(p.net_value)])},
   {title:'Product cost breakdown',note:'Trade cost uses the invoice trade price. Historical product cost is the batch cost saved on the invoice.',headers:['Invoice / Product / Batch','Dispatch trade cost','Returned trade cost','Net trade cost','Historical unit cost','Net product cost'],widths:[35,13,13,13,13,13],rows:data.productDetails.map(p=>[`${p.invoice_no}\n${p.name} / ${p.batch_number}`,cash(p.trade_dispatch_cost),cash(p.trade_return_cost),cash(Number(p.trade_dispatch_cost)-Number(p.trade_return_cost)),cash(p.unit_cost),cash(p.net_cost)])},
   monthlyInvoiceSummary(data,!filters.shop),
  ],
 };
}
