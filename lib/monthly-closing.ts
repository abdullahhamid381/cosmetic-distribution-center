import {query} from './db';
import type {PoolClient} from 'pg';
import {buildMonthlyStatements,monthlyRange,type MonthlyInvoice,type MonthlyStatement} from './monthly-statement';


export async function liveMonthlyStatements(month:string,shopId:string|null=null,client?:PoolClient,period?:{from:string;to:string;previous:MonthlyStatement[]}){
 const range=period?{...monthlyRange(month),start:period.from,cutoff:new Date(Date.parse(period.to+'T00:00:00Z')+86400000).toISOString().slice(0,10)}:monthlyRange(month);
 const run=async<T extends import('pg').QueryResultRow>(sql:string,args:unknown[])=>client?(await client.query<T>(sql,args)).rows:query<T>(sql,args);
 const [rows,legacyPrior,priorDocuments]=await Promise.all([
  run<MonthlyInvoice>(`WITH paid AS (
   SELECT pa.invoice_id,SUM(pa.amount) FILTER(WHERE p.payment_date<$1::date) AS before_month,
    SUM(pa.amount) FILTER(WHERE p.payment_date >= $1::date) AS in_month
   FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id WHERE p.payment_date<$2::date GROUP BY pa.invoice_id
  ), credited AS (
   SELECT invoice_id,SUM(total_credit) FILTER(WHERE (created_at AT TIME ZONE 'Asia/Karachi')::date<$1::date) AS before_month,
    SUM(total_credit) FILTER(WHERE (created_at AT TIME ZONE 'Asia/Karachi')::date >= $1::date) AS in_month
   FROM sales_returns WHERE (created_at AT TIME ZONE 'Asia/Karachi')::date<$2::date GROUP BY invoice_id
  ), activity AS (
   SELECT i.id::text,i.invoice_no,i.shop_id::text,s.shop_name,to_char(i.issue_date,'YYYY-MM-DD') AS issue_date,i.total::text AS original,
    CASE WHEN i.issue_date<$1::date THEN i.total-COALESCE(p.before_month,0)-COALESCE(r.before_month,0) ELSE 0 END AS opening,
    COALESCE(p.in_month,0) AS received,COALESCE(r.in_month,0) AS credits,
    i.total-COALESCE(p.before_month,0)-COALESCE(p.in_month,0)-COALESCE(r.before_month,0)-COALESCE(r.in_month,0) AS closing
   FROM invoices i JOIN shops s ON s.id=i.shop_id LEFT JOIN paid p ON p.invoice_id=i.id LEFT JOIN credited r ON r.invoice_id=i.id
   WHERE i.issue_date<$2::date AND ($3::bigint IS NULL OR i.shop_id=$3)
  ) SELECT * FROM activity WHERE issue_date >= $1::text OR opening<>0 OR received<>0 OR credits<>0 OR closing<>0 ORDER BY shop_name,issue_date,id`,[range.start,range.cutoff,shopId]),
  run<{shop_id:string;snapshot:MonthlyStatement}>('SELECT shop_id::text,snapshot FROM public.monthly_closings WHERE month_start=$1::date AND ($2::bigint IS NULL OR shop_id=$2)',[range.previousMonth+'-01',shopId]),
  run<{scope_key:string;snapshot:{statements:MonthlyStatement[]}}>('SELECT scope_key::text,snapshot FROM public.monthly_closing_documents WHERE month_start=$1::date AND scope_key IN (0,$2::bigint) ORDER BY scope_key',[range.previousMonth+'-01',shopId||'0']),
 ]);
 const previousByShop=new Map(legacyPrior.map(p=>[p.shop_id,p]));
 for(const doc of priorDocuments)for(const statement of doc.snapshot.statements)if(!shopId||statement.shopId===shopId)previousByShop.set(statement.shopId,{shop_id:statement.shopId,snapshot:statement});
 const prior=period?period.previous.map(snapshot=>({shop_id:snapshot.shopId,snapshot})):[...previousByShop.values()];
 const statements=buildMonthlyStatements(rows,month,new Map(prior.map(p=>[p.shop_id,p.snapshot.closing])),range.start);
 // Retain a previous saved balance even if all underlying invoices were later corrected or deleted.
 for(const p of prior)if(!statements.some(s=>s.shopId===p.shop_id))statements.push({shopId:p.shop_id,shopName:p.snapshot.shopName,month,opening:0,savedOpening:p.snapshot.closing,openingAdjustment:-p.snapshot.closing,currentSales:0,previousReceived:0,currentReceived:0,previousCredits:0,currentCredits:0,previousRemaining:0,currentRemaining:0,closing:0,invoices:[]});
 return {range,statements};
}
export async function savedMonthlyStatements(month:string,shopId:string|null=null){
 return query<{shop_id:string;snapshot:MonthlyStatement;closed_by:string;closed_at:string}>(`SELECT c.shop_id::text,c.snapshot,COALESCE(u.full_name,'Not recorded') AS closed_by,
 to_char(c.closed_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD HH24:MI') AS closed_at
 FROM public.monthly_closings c LEFT JOIN users u ON u.id=c.closed_by WHERE c.month_start=$1::date AND ($2::bigint IS NULL OR c.shop_id=$2)`,[month+'-01',shopId]);
}
