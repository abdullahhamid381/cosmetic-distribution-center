import {query} from './db';
import {requireRole} from './auth';
import {cache} from 'react';

export const financeRoles=['ADMIN','MANAGER','ACCOUNTS'];
const today="(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date";
const ledger=`SELECT p.id,'payment'::text AS kind,p.payment_date AS transaction_date,p.created_at,
 p.payment_no AS reference,s.shop_name AS title,p.method AS category,p.note,p.reference AS transaction_reference,p.created_by,p.amount AS signed_amount,NULL::bigint AS local_order_id
 FROM payments p JOIN shops s ON s.id=p.shop_id WHERE p.payment_date <= ${today}
 UNION ALL
 SELECT e.id,'expense'::text AS kind,e.expense_date AS transaction_date,e.created_at,
 'EXP-'||e.id AS reference,e.title,e.category,e.note,NULL::text AS transaction_reference,e.created_by,-e.amount AS signed_amount,NULL::bigint AS local_order_id
 FROM expenses e WHERE e.expense_date <= ${today}
 UNION ALL
 SELECT p.id,CASE WHEN p.kind='COLLECTION' THEN 'local_collection' ELSE 'local_refund' END,p.payment_date,p.created_at,
 'CO-'||o.id||'-PAY-'||p.id,o.customer_name,p.method,p.note,p.reference,p.created_by,
 CASE WHEN p.kind='COLLECTION' THEN p.amount ELSE -p.amount END,o.id
 FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id
 WHERE o.agent_id IS NULL AND p.payment_date <= ${today}`;

export const businessBalance = cache(async function businessBalance(){
 await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const [row]=await query<{received:string;spent:string;refunded:string;balance:string;as_of:string}>(`WITH ledger AS (${ledger})
 SELECT COALESCE(SUM(signed_amount) FILTER(WHERE kind IN ('payment','local_collection')),0) AS received,
 -COALESCE(SUM(signed_amount) FILTER(WHERE kind='expense'),0) AS spent,
 -COALESCE(SUM(signed_amount) FILTER(WHERE kind='local_refund'),0) AS refunded,
 COALESCE(SUM(signed_amount),0) AS balance,to_char(${today},'YYYY-MM-DD') AS as_of FROM ledger`);
 return row;
});

export function balanceFilters(input:{from?:string;to?:string;kind?:string;page?:string}){
 const from=typeof input.from==='string'?input.from:'',to=typeof input.to==='string'?input.to:'';
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const kind=input.kind&&['payment','expense','local_collection','local_refund'].includes(input.kind)?input.kind:'';
 const rawPage=Number(input.page||1);
 const page=Number.isSafeInteger(rawPage)&&rawPage>0&&rawPage<1000000?rawPage:1;
 const error=(from&&!validDate(from))||(to&&!validDate(to))?'Choose valid transaction dates.':from&&to&&from>to?'From date must be on or before To date.':'';
 return {from,to,kind,page,error};
}

export async function balanceTransactions(filters:ReturnType<typeof balanceFilters>){
 await requireRole('ADMIN','MANAGER','ACCOUNTS');
 if(filters.error)return {rows:[],count:0,page:1,pages:1};
 const params=[filters.from||null,filters.to||null,filters.kind||null];
 const where='($1::date IS NULL OR transaction_date >= $1) AND ($2::date IS NULL OR transaction_date <= $2) AND ($3::text IS NULL OR kind=$3)';
 const [count]=await query<{count:string}>(`WITH ledger AS (${ledger}) SELECT COUNT(*) AS count FROM ledger WHERE ${where}`,params);
 const total=Number(count.count),pages=Math.max(1,Math.ceil(total/50)),page=Math.min(filters.page,pages);
 const rows=await query<{id:string;kind:'payment'|'expense'|'local_collection'|'local_refund';local_order_id:string|null;date:string;reference:string;title:string;category:string;note:string|null;transaction_reference:string|null;recorded_by:string;signed_amount:string;running_balance:string;has_receipt:boolean;invoices:{id:string;number:string;amount:string}[]}>(`WITH ledger AS (${ledger}), balances AS (
 SELECT *,SUM(signed_amount) OVER(ORDER BY transaction_date,created_at,kind,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance FROM ledger
 ) SELECT b.id,b.kind,b.local_order_id,to_char(b.transaction_date,'YYYY-MM-DD') AS date,b.reference,b.title,b.category,b.note,b.transaction_reference,
 COALESCE(u.full_name,'Not recorded') AS recorded_by,b.signed_amount,b.running_balance,
 (b.kind='payment' AND EXISTS(SELECT 1 FROM payment_receipts pr WHERE pr.payment_id=b.id)) AS has_receipt,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id::text,'number',i.invoice_no,'amount',pa.amount::text) ORDER BY i.id)
 FROM payment_allocations pa JOIN invoices i ON i.id=pa.invoice_id WHERE b.kind='payment' AND pa.payment_id=b.id),'[]'::jsonb) AS invoices
 FROM balances b LEFT JOIN users u ON u.id=b.created_by WHERE ${where}
 ORDER BY b.transaction_date DESC,b.created_at DESC,b.kind DESC,b.id DESC LIMIT 50 OFFSET $4`,[...params,(page-1)*50]);
 return {rows,count:total,page,pages};
}
