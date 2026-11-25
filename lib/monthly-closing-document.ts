import {query} from './db';
import type {MonthlyStatement} from './monthly-statement';
import type {MonthlyFinancials} from './monthly-financials';
export type SavedClosingDocument={statements:MonthlyStatement[];financials:MonthlyFinancials};
export async function savedClosingDocument(month:string,shop:string|null){
 const [row]=await query<{snapshot:SavedClosingDocument;staff:string;saved_at:string}>(`SELECT c.snapshot,COALESCE(u.full_name,'Not recorded') AS staff,to_char(c.closed_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD HH24:MI') AS saved_at
 FROM public.monthly_closing_documents c LEFT JOIN users u ON u.id=c.closed_by WHERE month_start=$1::date AND scope_key=$2`,[month+'-01',shop||'0']);
 return row||null;
}
