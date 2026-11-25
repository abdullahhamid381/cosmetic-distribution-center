import {query} from './db';
import type {PoolClient,QueryResultRow} from 'pg';
import {closingPeriod,nextDate,pakistanToday} from './closing-period';
import {liveMonthlyStatements} from './monthly-closing';
import {monthlyFinancials,collectionClosing,type MonthlyFinancials} from './monthly-financials';
import type {MonthlyStatement} from './monthly-statement';
export type SessionSnapshot={statements:MonthlyStatement[];financials:MonthlyFinancials|null};
export type ClosingSession=QueryResultRow&{id:string;scope_key:string;from_date:string;through_date:string;status:'CLOSED'|'REOPENED';snapshot:SessionSnapshot;staff:string;closed_at:string;reopened_at:string|null;reopened_by_name:string|null;reopen_reason:string};
const columns=`c.*,c.id::text,c.scope_key::text,to_char(c.from_date,'YYYY-MM-DD') AS from_date,to_char(c.through_date,'YYYY-MM-DD') AS through_date,
 COALESCE(u.full_name,'Not recorded') AS staff,to_char(c.closed_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD HH24:MI:SS') AS closed_at,
 to_char(c.reopened_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD HH24:MI:SS') AS reopened_at,ru.full_name AS reopened_by_name`;
export function validScope(shop:string){if(shop&&(!/^\d+$/.test(shop)||!Number.isSafeInteger(Number(shop))||Number(shop)<1))throw new Error('Choose a valid shop.');return shop||'0';}
export async function sessionHistory(shop:string){
 return query<ClosingSession>(`SELECT ${columns} FROM public.closing_sessions c LEFT JOIN users u ON u.id=c.closed_by LEFT JOIN users ru ON ru.id=c.reopened_by WHERE scope_key=$1 ORDER BY c.through_date DESC,c.id DESC`,[validScope(shop)]);
}
export async function sessionById(id:string){
 if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id)))return null;
 return (await query<ClosingSession>(`SELECT ${columns} FROM public.closing_sessions c LEFT JOIN users u ON u.id=c.closed_by LEFT JOIN users ru ON ru.id=c.reopened_by WHERE c.id=$1`,[id]))[0]||null;
}
export async function sessionPreview(from:string,to:string,shop:string,client?:PoolClient){
 const scope=validScope(shop),range=closingPeriod(from,to);
 const run=async(sql:string,args:unknown[])=>client?(await client.query(sql,args)).rows:query(sql,args);
 const [previous]=await run(`SELECT snapshot FROM public.closing_sessions WHERE scope_key=$1 AND status='CLOSED' AND through_date<$2::date ORDER BY through_date DESC,id DESC LIMIT 1`,[scope,from]);
 const prior=previous?.snapshot as SessionSnapshot|undefined;
 const previousResult=prior?.financials?collectionClosing(prior.financials).closingResult??null:null;
 const [live,financials]=await Promise.all([
  liveMonthlyStatements(range.month,shop||null,client,{from,to,previous:prior?.statements||[]}),
  monthlyFinancials(range.month,shop||null,client,{from,to,previousResult}),
 ]);
 return {statements:live.statements,financials};
}
export function nextSessionStart(history:ClosingSession[],fallback:string){
 const closed=history.filter(s=>s.status==='CLOSED').sort((a,b)=>b.through_date.localeCompare(a.through_date));
 return closed.length?nextDate(closed[0].through_date):fallback;
}
export async function firstSessionDate(shop:string){
 const [row]=await query(`SELECT min(day)::text AS first FROM (
 SELECT issue_date AS day FROM invoices WHERE ($1::bigint=0 OR shop_id=$1)
 UNION ALL SELECT payment_date FROM payments WHERE ($1::bigint=0 OR shop_id=$1)
 UNION ALL SELECT expense_date FROM expenses WHERE $1::bigint=0
 ) activity`,[validScope(shop)]);
 return row?.first?String(row.first):pakistanToday().slice(0,7)+'-01';
}
