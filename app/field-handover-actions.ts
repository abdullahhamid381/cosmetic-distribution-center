'use server';

import {unstable_rethrow} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireRole, type CurrentUser} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {fieldLocation} from '@/lib/field-sales';
import {cents, fromCents, integer, str} from '@/lib/utils';
import type {PoolClient} from 'pg';
import type {DepartmentFormState} from '@/components/DepartmentForm';

async function trackHandover(tx:PoolClient,user:CurrentUser,action:string,id:number,form:FormData,details:Record<string,unknown>) {
  const location=fieldLocation(form);
  await tx.query(`INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details)
    VALUES($1,$2,'field_handover',$3,$4)`,[user.id,action,id,JSON.stringify({...details,...(location?{location}:{})})]);
}

async function saveHandover(save:()=>Promise<string>):Promise<DepartmentFormState> {
  try {
    const success=await save();
    revalidatePath('/field');
    revalidatePath('/field/reports');
    revalidatePath('/field/handovers');
    return {success};
  } catch(error) {
    unstable_rethrow(error);
    const code=(error as {code?:string})?.code;
    if(code==='23505')return {error:'A selected payment has already been submitted. Refresh the page and check the handover list.'};
    if(code){
      console.error('Field handover failed',code);
      return {error:'The handover could not be saved. Try again or contact your administrator.'};
    }
    return {error:error instanceof Error?error.message:'The handover could not be saved.'};
  }
}

export async function submitFieldHandover(_:DepartmentFormState,form:FormData) {
  const user=await requireRole('SALES','FIELD_SALES','MANAGER');
  return saveHandover(async()=>{
    const requested=form.getAll('payment_id');
    if(!requested.length||requested.length>60)throw new Error('Select between one and 60 payments.');
    const ids=[...new Set(requested.map(value=>integer(value,'Payment')))];
    const note=str(form,'note');
    if(note.length>500)throw new Error('Keep the handover note under 500 characters.');
    const id=await transaction(async tx=>{
      const {rows:payments}=await tx.query(`SELECT p.id,p.amount,p.method FROM payments p
        WHERE p.id=ANY($1::bigint[]) AND p.created_by=$2 AND p.field_submission_id IS NOT NULL
        ORDER BY p.id FOR UPDATE OF p`,[ids,user.id]);
      if(payments.length!==ids.length)throw new Error('Select payments that you collected in Field Sales.');
      const {rowCount}=await tx.query(`SELECT 1 FROM field_payment_handover_items
        WHERE payment_id=ANY($1::bigint[]) AND released_at IS NULL LIMIT 1`,[ids]);
      if(rowCount)throw new Error('A selected payment is already assigned to a handover.');
      const total=payments.reduce((sum,p)=>sum+cents(Number(p.amount)),0);
      const cash=payments.reduce((sum,p)=>sum+(p.method==='CASH'?cents(Number(p.amount)):0),0);
      const {rows:[handover]}=await tx.query(`INSERT INTO field_payment_handovers(submitted_by,amount,cash_amount,note)
        VALUES($1,$2,$3,$4) RETURNING id`,[user.id,fromCents(total),fromCents(cash),note]);
      await tx.query(`INSERT INTO field_payment_handover_items(handover_id,payment_id,receipt_number,shop_name,method,amount)
        SELECT $1, p.id,COALESCE(p.payment_no,'PAY-'||p.id),s.shop_name,p.method,p.amount
        FROM payments p JOIN shops s ON s.id=p.shop_id WHERE p.id=ANY($2::bigint[])`,[handover.id,ids]);
      await trackHandover(tx,user,'FIELD_SUBMIT_HANDOVER',Number(handover.id),form,
        {paymentIds:ids,amount:fromCents(total),cashAmount:fromCents(cash)});
      return handover.id;
    });
    return 'Handover #'+id+' submitted for admin approval.';
  });
}

export async function reviewFieldHandover(_:DepartmentFormState,form:FormData) {
  const user=await requireRole('ADMIN');
  return saveHandover(async()=>{
    const id=integer(form.get('handover_id'),'Handover');
    const status=str(form,'decision'),note=str(form,'review_note');
    if(status!=='APPROVED'&&status!=='REJECTED')throw new Error('Choose Approve or Reject.');
    if(note.length>500||(status==='REJECTED'&&!note))throw new Error('Enter a reason when rejecting. Keep the note under 500 characters.');
    await transaction(async tx=>{
      const {rows:[handover]}=await tx.query(`UPDATE field_payment_handovers
        SET status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4
        WHERE id=$1 AND status='SUBMITTED' AND submitted_by<>$3 RETURNING submitted_by,amount`,
        [id,status,user.id,note]);
      if(!handover)throw new Error('This handover is unavailable or has already been reviewed.');
      if(status==='REJECTED')await tx.query(`UPDATE field_payment_handover_items SET released_at=now()
        WHERE handover_id=$1 AND released_at IS NULL`,[id]);
      await trackHandover(tx,user,status==='APPROVED'?'FIELD_APPROVE_HANDOVER':'FIELD_REJECT_HANDOVER',id,form,
        {submittedBy:handover.submitted_by,amount:handover.amount,reviewNote:note});
    });
    return status==='APPROVED'?'Handover approved.':'Handover rejected. The salesperson can submit the payments again.';
  });
}
