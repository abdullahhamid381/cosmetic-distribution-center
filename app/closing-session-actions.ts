'use server';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {closingPeriod,nextDate,validateSessionSequence} from '@/lib/closing-period';
import {sessionPreview,validScope} from '@/lib/closing-sessions';
import {isCompleteFinancialSnapshot} from '@/lib/monthly-financials';
import {str,integer} from '@/lib/utils';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
type State={error:string};
export async function closeSession(_previous:State,form:FormData):Promise<State>{
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS'),shop=str(form,'shop'),from=str(form,'from'),to=str(form,'to');
 try{
  const scope=validScope(shop);closingPeriod(from,to);
  await transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['closing-session:'+scope]);
   if(shop&&!(await client.query('SELECT id FROM shops WHERE id=$1',[shop])).rows.length)throw new Error('Shop not found.');
   const closed=(await client.query(`SELECT id,to_char(from_date,'YYYY-MM-DD') AS from_date,to_char(through_date,'YYYY-MM-DD') AS through_date FROM public.closing_sessions WHERE scope_key=$1 AND status='CLOSED' ORDER BY through_date DESC,id DESC FOR UPDATE`,[scope])).rows;
   if(!validateSessionSequence(from,to,closed as {from_date:string;through_date:string}[]))return;
   const snapshot=await sessionPreview(from,to,shop,client);
   if(!isCompleteFinancialSnapshot(snapshot.financials))throw new Error('Financial registers are incomplete. Please reload and try again.');
   const row=(await client.query(`INSERT INTO public.closing_sessions(scope_key,from_date,through_date,snapshot,closed_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,[scope,from,to,JSON.stringify(snapshot),user.id])).rows[0];
   await client.query(`INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'CLOSE_SESSION','closing_session',$2,$3)`,[user.id,row.id,JSON.stringify({shop:shop||null,from,to,nextStart:nextDate(to),closingResult:snapshot.financials.closingResult})]);
  });
 }catch(error){return {error:error instanceof Error&&!('code' in error)?error.message:'The session could not be saved. No changes were committed. Please try again.'};}
 revalidatePath('/monthly-closing');redirect(`/monthly-closing?${new URLSearchParams({shop})}`);
}
export async function reopenSession(_previous:State,form:FormData):Promise<State>{
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');let shop='',from='',to='';
 try{
  const id=integer(form.get('session'),'Closing session'),reason=str(form,'reason');if(reason.length>1000)throw new Error('Keep the reopening reason within 1000 characters.');
  await transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
   const base=(await client.query('SELECT scope_key::text AS scope_key FROM public.closing_sessions WHERE id=$1',[id])).rows[0];if(!base)throw new Error('Closing not found.');
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['closing-session:'+base.scope_key]);
   const row=(await client.query(`SELECT *,to_char(from_date,'YYYY-MM-DD') AS from_date,to_char(through_date,'YYYY-MM-DD') AS through_date FROM public.closing_sessions WHERE id=$1 FOR UPDATE`,[id])).rows[0];
   shop=Number(row.scope_key)===0?'':String(row.scope_key);from=row.from_date;to=row.through_date;
   if(row.status==='REOPENED')return;
   if((await client.query("SELECT id FROM public.closing_sessions WHERE scope_key=$1 AND status='CLOSED' AND through_date>$2::date",[row.scope_key,to])).rows.length)throw new Error('Reopen later sessions first, so carried balances remain in order.');
   await client.query("UPDATE public.closing_sessions SET status='REOPENED',reopened_by=$1,reopened_at=NOW(),reopen_reason=$2 WHERE id=$3",[user.id,reason,id]);
   await client.query(`INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'REOPEN_SESSION','closing_session',$2,$3)`,[user.id,id,JSON.stringify({shop:shop||null,from,to,reason})]);
  });
 }catch(error){return {error:error instanceof Error&&!('code' in error)?error.message:'The session could not be reopened. No changes were committed. Please try again.'};}
 revalidatePath('/monthly-closing');redirect(`/monthly-closing?${new URLSearchParams({shop,from,to})}`);
}
