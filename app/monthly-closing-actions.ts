'use server';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {liveMonthlyStatements} from '@/lib/monthly-closing';
import {monthlyRange} from '@/lib/monthly-statement';
import {integer,str} from '@/lib/utils';
import {revalidatePath} from 'next/cache';
import {monthlyFinancials,isCompleteFinancialSnapshot} from '@/lib/monthly-financials';

export async function closeMonth(_previous:{error:string;message:string},form:FormData){
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const month=str(form,'month'),shop=str(form,'shop');
 try{monthlyRange(month);if(shop)integer(shop,'Shop');}catch(error){return {error:error instanceof Error?error.message:'Choose a valid month and shop.',message:''};}
 let saved=0,documentSaved=false;
 try{
  await transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['monthly-closing:'+month]);
   if(shop&&!(await client.query('SELECT id FROM shops WHERE id=$1',[shop])).rows.length)throw new Error('Shop not found');
   const existing=await client.query('SELECT id FROM public.monthly_closing_documents WHERE month_start=$1::date AND scope_key IN (0,$2::bigint)',[month+'-01',shop||'0']);
   if(existing.rows.length)return;
   const {statements}=await liveMonthlyStatements(month,shop||null,client);
   const financials=await monthlyFinancials(month,shop||null,client);
   if(!isCompleteFinancialSnapshot(financials))throw new Error('Financial registers are incomplete.');
   const document=await client.query(`INSERT INTO public.monthly_closing_documents(month_start,scope_key,snapshot,closed_by) VALUES($1,$2,$3,$4)
    ON CONFLICT(month_start,scope_key) DO NOTHING RETURNING id`,[month+'-01',shop||'0',JSON.stringify({statements,financials}),user.id]);
   documentSaved=Boolean(document.rows.length);
   if(documentSaved)await client.query(`INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'SAVE_CLOSING_DOCUMENT','monthly_closing_document',$2,$3)`,[user.id,document.rows[0].id,JSON.stringify({month,shop:shop||null,netProfit:financials.netProfit})]);
   for(const statement of statements){
    const result=await client.query(`INSERT INTO public.monthly_closings(month_start,shop_id,snapshot,closed_by) VALUES($1,$2,$3,$4)
     ON CONFLICT(month_start,shop_id) DO NOTHING RETURNING id`,[month+'-01',statement.shopId,JSON.stringify(statement),user.id]);
    if(result.rows.length){saved++;await client.query(`INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'CLOSE_MONTH','monthly_closing',$2,$3)`,[user.id,result.rows[0].id,JSON.stringify({month,shopId:statement.shopId,opening:statement.opening,closing:statement.closing})]);}
   }
  });
 }catch{return {error:'The closing could not be saved. No closing changes were committed. Please try again.',message:''};}
 revalidatePath('/monthly-closing');
 return {error:'',message:saved?`${saved} shop closing${saved===1?'':'s'} saved. ${documentSaved?'Complete costs, expenses and receipt details were saved. ':''}Unpaid invoice balances carry forward without creating new debt.`:documentSaved?'Complete financial closing document saved. Existing shop summaries were kept.':'No new closings to save. Existing saved summaries were kept.'};
}

export async function reopenMonth(_previous:{error:string;message:string},form:FormData){
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const month=str(form,'month'),shop=str(form,'shop'),reason=str(form,'reason');
 try{monthlyRange(month);if(shop)integer(shop,'Shop');if(reason.length>1000)throw new Error('Keep the reopening reason within 1000 characters.');}catch(error){return {error:error instanceof Error?error.message:'Choose a valid month and shop.',message:''};}
 let reopened=false,wholeClosing=false;
 try{
  await transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['monthly-closing:'+month]);
   if(shop&&(await client.query('SELECT id FROM public.monthly_closing_documents WHERE month_start=$1::date AND scope_key=0',[month+'-01'])).rows.length){wholeClosing=true;return;}
   const documents=(await client.query('SELECT * FROM public.monthly_closing_documents WHERE month_start=$1::date AND ($2::bigint=0 OR scope_key=$2) FOR UPDATE',[month+'-01',shop||'0'])).rows;
   const statements=(await client.query('SELECT * FROM public.monthly_closings WHERE month_start=$1::date AND ($2::bigint=0 OR shop_id=$2) FOR UPDATE',[month+'-01',shop||'0'])).rows;
   if(!documents.length&&!statements.length)return;
   const archived=await client.query(`INSERT INTO public.monthly_closing_revisions(month_start,scope_key,snapshot,reopened_by,reason) VALUES($1,$2,$3,$4,$5) RETURNING id`,[month+'-01',shop||'0',JSON.stringify({documents,statements}),user.id,reason]);
   await client.query('DELETE FROM public.monthly_closing_documents WHERE month_start=$1::date AND ($2::bigint=0 OR scope_key=$2)',[month+'-01',shop||'0']);
   await client.query('DELETE FROM public.monthly_closings WHERE month_start=$1::date AND ($2::bigint=0 OR shop_id=$2)',[month+'-01',shop||'0']);
   await client.query(`INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'REOPEN_CLOSING','monthly_closing_revision',$2,$3)`,[user.id,archived.rows[0].id,JSON.stringify({month,shop:shop||null,reason,archivedDocuments:documents.length,archivedStatements:statements.length})]);
   reopened=true;
  });
 }catch{return {error:'The closing could not be reopened. No changes were committed. Please try again.',message:''};}
 if(wholeClosing)return {error:'This shop is included in a saved all-shops closing. Select All shops and reopen that closing first.',message:''};
 revalidatePath('/monthly-closing');
 return {error:'',message:reopened?'Closing reopened. The previous summary is preserved in history. Review live records and close again whenever you are ready.':'This closing is already open.'};
}
