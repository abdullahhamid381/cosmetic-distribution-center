export type MonthlyInvoice={id:string;invoice_no:string;shop_id:string;shop_name:string;issue_date:string;original:string;opening:string;received:string;credits:string;closing:string};
export type MonthlyStatement={shopId:string;shopName:string;month:string;opening:number;savedOpening:number|null;openingAdjustment:number;currentSales:number;previousReceived:number;currentReceived:number;previousCredits:number;currentCredits:number;previousRemaining:number;currentRemaining:number;closing:number;invoices:MonthlyInvoice[]};
const cents=(v:string|number)=>Math.round(Number(v)*100);
export function monthlyRange(month:string,now=new Date()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000)throw new Error('Choose a valid month from year 2000 onward.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(month>today.slice(0,7))throw new Error('Future months cannot be summarized yet.');
 const start=month+'-01',next=new Date(start+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 const nextStart=next.toISOString().slice(0,10),end=new Date(next.getTime()-86400000).toISOString().slice(0,10);
 const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const previous=new Date(start+'T12:00:00Z');previous.setUTCMonth(previous.getUTCMonth()-1);
 return {month,start,end,nextStart,previousMonth:previous.toISOString().slice(0,7),cutoff:nextStart<=today?nextStart:tomorrow.toISOString().slice(0,10),canClose:true,isComplete:nextStart<=today,today};
}
export function buildMonthlyStatements(rows:MonthlyInvoice[],month:string,previous:Map<string,number>=new Map(),start=month+'-01'){
 const result=new Map<string,MonthlyStatement>();
 for(const row of rows){
  const s=result.get(row.shop_id)||{shopId:row.shop_id,shopName:row.shop_name,month,opening:0,savedOpening:previous.has(row.shop_id)?previous.get(row.shop_id)!:null,openingAdjustment:0,currentSales:0,previousReceived:0,currentReceived:0,previousCredits:0,currentCredits:0,previousRemaining:0,currentRemaining:0,closing:0,invoices:[]};
  const old=row.issue_date<start;
  s.opening+=cents(row.opening);s.currentSales+=old?0:cents(row.original);
  if(old){s.previousReceived+=cents(row.received);s.previousCredits+=cents(row.credits);s.previousRemaining+=cents(row.closing);}else{s.currentReceived+=cents(row.received);s.currentCredits+=cents(row.credits);s.currentRemaining+=cents(row.closing);}
  s.closing+=cents(row.closing);s.invoices.push(row);result.set(row.shop_id,s);
 }
 for(const s of result.values()){
  for(const key of ['opening','currentSales','previousReceived','currentReceived','previousCredits','currentCredits','previousRemaining','currentRemaining','closing'] as const)s[key]/=100;
  s.openingAdjustment=s.savedOpening===null?0:(cents(s.opening)-cents(s.savedOpening))/100;
 }
 return [...result.values()];
}
