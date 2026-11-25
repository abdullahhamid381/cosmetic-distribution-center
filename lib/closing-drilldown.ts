import type {MonthlyStatement,MonthlyInvoice} from './monthly-statement';
export type ClosingDetailKind='opening'|'sales'|'previousPending'|'currentPending'|'carry'|'previousReceipts'|'currentReceipts'|'credits'|'previousCredits'|'all'|'adjustment'|'goods'|'expenses'|'receipts'|'returns'|'result'|'closingResult'|'openingResult';
export const closingDetailTitles:Record<ClosingDetailKind,string>={opening:'Opening unpaid invoices',sales:'Invoices issued in this period',previousPending:'Previous invoices still pending',currentPending:'Current invoices still pending',carry:'Unpaid invoices carried forward',previousReceipts:'Collections on previous invoices',currentReceipts:'Collections on current invoices',credits:'Return credits allocated in this period',previousCredits:'Credits on previous invoices',all:'Complete invoice breakdown',adjustment:'Opening balance adjustment',goods:'Historical cost of goods',expenses:'Operating expense detail',receipts:'Actual payment receipts',returns:'Returns and reversed goods costs',result:'Collection result calculation',closingResult:'Result carried forward',openingResult:'Opening result brought forward'};
export function closingInvoiceRows(statements:MonthlyStatement[],from:string,kind:ClosingDetailKind,shopId?:string){
 return statements.filter(s=>!shopId||s.shopId===shopId).flatMap(s=>s.invoices.map(i=>({...i,shopName:s.shopName}))).filter(i=>{
  const previous=i.issue_date<from;
  if(kind==='opening')return Number(i.opening)!==0;
  if(kind==='sales')return !previous;
  if(kind==='previousPending')return previous&&Number(i.closing)!==0;
  if(kind==='currentPending')return !previous&&Number(i.closing)!==0;
  if(kind==='carry')return Number(i.closing)!==0;
  if(kind==='previousReceipts')return previous&&Number(i.received)!==0;
  if(kind==='currentReceipts')return !previous&&Number(i.received)!==0;
  if(kind==='credits')return Number(i.credits)!==0;
  if(kind==='previousCredits')return previous&&Number(i.credits)!==0;
  return true;
 });
}
export function closingInvoiceValue(i:MonthlyInvoice,kind:ClosingDetailKind){
 if(kind==='opening')return -Number(i.opening);
 if(kind==='sales')return Number(i.original);
 if(kind==='previousReceipts'||kind==='currentReceipts')return Number(i.received);
 if(kind==='credits'||kind==='previousCredits')return Number(i.credits);
 return -Number(i.closing);
}
