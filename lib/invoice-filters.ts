import {invoiceSlipNumberSql} from './invoice-dates';

export type InvoiceFilterInput={month?:string;week?:string;shop?:string;from?:string;to?:string;status?:string;q?:string;sort?:string};
function weekStart(value:string){
 if(!/^[1-9]\d{3}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(value))return '';
 const year=Number(value.slice(0,4)),week=Number(value.slice(6));
 const monday=new Date(Date.UTC(year,0,4));
 monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7)+(week-1)*7);
 const thursday=new Date(monday);thursday.setUTCDate(thursday.getUTCDate()+3);
 return thursday.getUTCFullYear()===year?monday.toISOString().slice(0,10):'';
}
export function invoiceFilterQuery(input:InvoiceFilterInput) {
 const read=(key:keyof InvoiceFilterInput)=>typeof input[key]==='string'?input[key]!.trim():'';
 const filters={month:read('month'),week:read('week'),shop:read('shop'),from:read('from'),to:read('to'),status:read('status'),q:read('q'),sort:read('sort')||'newest'};
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const statuses:Record<string,string>={pending:'i.total>i.paid_total+i.credit_total',unpaid:'i.paid_total=0 AND i.total>i.credit_total',partial:'i.paid_total>0 AND i.total>i.paid_total+i.credit_total',settled:'i.total=i.paid_total+i.credit_total',overdue:'i.due_date<CURRENT_DATE AND i.total>i.paid_total+i.credit_total'};
 const sorts:Record<string,string>={newest:'i.issue_date DESC,i.id DESC',oldest:'i.issue_date ASC,i.id ASC',due:'i.due_date ASC,i.id ASC',balance:'(i.total-i.paid_total-i.credit_total) DESC,i.id DESC',amount:'i.total DESC,i.id DESC'};
 let error='';
 if(filters.month&&(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(filters.month)))error='Choose a valid invoice month.';
 else if(filters.week&&!weekStart(filters.week))error='Choose a valid invoice week.';
 else if(filters.shop&&(!/^\d+$/.test(filters.shop)||!Number.isSafeInteger(Number(filters.shop))||Number(filters.shop)<1))error='Choose a valid store.';
 else if((filters.from&&!validDate(filters.from))||(filters.to&&!validDate(filters.to)))error='Enter valid From and To dates.';
 else if(filters.from&&filters.to&&filters.from>filters.to)error='From date must be on or before To date.';
 else if(filters.status&&!Object.hasOwn(statuses,filters.status))error='Choose a valid payment status.';
 else if(!Object.hasOwn(sorts,filters.sort))error='Choose a valid sort order.';
 else if(filters.q.length>100)error='Search must be 100 characters or fewer.';
 const conditions:string[]=[],params:string[]=[];
 const bind=(value:string)=>{params.push(value);return '$'+params.length;};
 if(!error) {
  if(filters.month){const p=bind(filters.month+'-01');conditions.push(`i.issue_date >= ${p}::date AND i.issue_date < ${p}::date + INTERVAL '1 month'`);}
  if(filters.week){const p=bind(weekStart(filters.week));conditions.push(`i.issue_date >= ${p}::date AND i.issue_date < ${p}::date + INTERVAL '7 days'`);}
  if(filters.shop)conditions.push(`i.shop_id=${bind(filters.shop)}::bigint`);
  if(filters.from)conditions.push(`i.issue_date >= ${bind(filters.from)}::date`);
  if(filters.to)conditions.push(`i.issue_date <= ${bind(filters.to)}::date`);
  if(filters.status)conditions.push('('+statuses[filters.status]+')');
  if(filters.q){
   const p=bind(filters.q);
   conditions.push(`(strpos(lower(COALESCE(i.invoice_no,'')),lower(${p}))>0 OR strpos(lower(COALESCE(i.legacy_invoice_no,'')),lower(${p}))>0 OR strpos(lower(s.shop_name),lower(${p}))>0 OR strpos(lower(s.store_code),lower(${p}))>0 OR 'INV-'||to_char(i.issue_date,'YYYYMMDD')||'-'||${invoiceSlipNumberSql}=upper(${p}))`);
  }
 }
 return {filters,error,params,sql:`SELECT i.*,to_char(i.issue_date,'YYYY-MM-DD') AS issue_date,to_char(i.due_date,'YYYY-MM-DD') AS due_date,s.shop_name,
 (i.due_date<CURRENT_DATE AND i.total>i.paid_total+i.credit_total) AS overdue
 FROM invoices i JOIN shops s ON s.id=i.shop_id LEFT JOIN deliveries d ON d.id=i.delivery_id ${conditions.length?'WHERE '+conditions.join(' AND '):''}
 ORDER BY ${sorts[filters.sort]||sorts.newest}`};
}
