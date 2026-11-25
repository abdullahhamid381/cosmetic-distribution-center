'use server';
import bcrypt from 'bcryptjs';
import {requireRole,createSession} from '@/lib/auth';
import {requireAgent} from '@/lib/agent-portal';
import {transaction} from '@/lib/db';
import type {PoolClient} from 'pg';
import {required,str,integer,amount,validatePct} from '@/lib/utils';
import {paymentBalance,paymentMethods} from '@/lib/sales-team';
import {revalidatePath} from 'next/cache';
import {unstable_rethrow} from 'next/navigation';
import type {DepartmentFormState} from '@/components/DepartmentForm';
class PortalInputError extends Error {}
function password(f:FormData,key='password'){const value=String(f.get(key)||'');if(value.length<12||Buffer.byteLength(value,'utf8')>72)throw new PortalInputError('Use a password of at least 12 characters and at most 72 UTF-8 bytes.');return value;}
function money(f:FormData,key:string){const raw=required(f,key);const n=Number(raw);if(!Number.isFinite(n)||n<=0||n>99999999999)throw new PortalInputError('Enter a valid payment amount greater than zero.');return amount(n);}
async function run(work:()=>Promise<void>,success='Saved successfully.'):Promise<DepartmentFormState>{try{await work();revalidatePath('/agent','layout');revalidatePath('/sales-team','layout');return {success};}catch(e){unstable_rethrow(e);return {error:e instanceof PortalInputError?e.message:'Could not save. Check your details and permissions, then try again.'};}}
async function audit(tx:PoolClient,uid:number,action:string,entity:string,id:number,details:object={}){await tx.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[uid,action,entity,id,JSON.stringify(details)]);}
export async function createAgentPortalAccount(_:DepartmentFormState,f:FormData){return run(async()=>{
 const admin=await requireRole('ADMIN'),name=required(f,'full_name'),email=required(f,'email').toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new PortalInputError('Enter a valid email address.');
 const hash=await bcrypt.hash(password(f),12),pct=validatePct(required(f,'commission_pct'));
 await transaction(async tx=>{
  const staff=(await tx.query("INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,'SALES') ON CONFLICT(email) DO NOTHING RETURNING id",[name,email,hash])).rows[0];
  if(!staff)throw new PortalInputError('That email already has a staff account. Enable its sales agent profile instead.');
  const agent=(await tx.query('INSERT INTO sales_agents(user_id,phone,territory,commission_pct,active) VALUES($1,$2,$3,$4,true) RETURNING id',[staff.id,str(f,'phone'),str(f,'territory'),pct])).rows[0];
  await audit(tx,admin.id,'CREATE_PORTAL_ACCESS','sales_agent',Number(agent.id),{user_id:staff.id,email});
 });
},'Agent login created. Share the email, initial password and /agent-login link privately with the agent.');}
export async function resetAgentPortalPassword(_:DepartmentFormState,f:FormData){return run(async()=>{
 const admin=await requireRole('ADMIN'),id=integer(f.get('agent_id'),'Agent'),hash=await bcrypt.hash(password(f),12);
 await transaction(async tx=>{
  const staff=(await tx.query("UPDATE users u SET password_hash=$1,session_version=session_version+1 FROM sales_agents a WHERE a.id=$2 AND a.user_id=u.id AND u.role='SALES' RETURNING u.id",[hash,id])).rows[0];
  if(!staff)throw new PortalInputError('Sales account not found.');await audit(tx,admin.id,'RESET_PORTAL_PASSWORD','sales_agent',id);
 });
},'Password reset. Previous login sessions have been signed out.');}
export async function saveMyAgentProfile(_:DepartmentFormState,f:FormData){return run(async()=>{
 const {user,profile}=await requireAgent();
 await transaction(async tx=>{await tx.query('UPDATE sales_agents SET phone=$1,address=$2 WHERE id=$3 AND user_id=$4',[str(f,'phone'),str(f,'address'),profile.id,user.id]);await audit(tx,user.id,'UPDATE_MY_PROFILE','sales_agent',Number(profile.id));});
});}
export async function changeMyAgentPassword(_:DepartmentFormState,f:FormData){return run(async()=>{
 const {user}=await requireAgent(),next=password(f,'new_password');if(next!==String(f.get('confirm_password')||''))throw new PortalInputError('New password and confirmation do not match.');
 await transaction(async tx=>{
  const staff=(await tx.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];
  if(!staff||!(await bcrypt.compare(String(f.get('current_password')||''),staff.password_hash)))throw new PortalInputError('Current password is incorrect.');
  await tx.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2',[await bcrypt.hash(next,12),user.id]);
  await audit(tx,user.id,'CHANGE_PASSWORD','user',user.id);
 });
 await createSession(user.id);
},'Password changed. Other login sessions have been signed out.');}
async function paymentRoom(tx:PoolClient,order:Record<string,any>,includePending:boolean){
 const sums=(await tx.query(`SELECT COALESCE((SELECT SUM(quantity*retail_price) FROM customer_order_items WHERE order_id=$1),0) AS retail_total,
 COALESCE((SELECT SUM(CASE WHEN kind='COLLECTION' THEN amount ELSE -amount END) FROM customer_order_payments WHERE order_id=$1),0) AS collected,
 COALESCE((SELECT SUM(amount) FROM order_payment_reports WHERE order_id=$1 AND status='PENDING'),0) AS pending`,[order.id])).rows[0];
 const b=paymentBalance({...order,...sums} as Parameters<typeof paymentBalance>[0]);return Math.max(0,Math.round(b.due*100)-(includePending?Math.round(Number(sums.pending)*100):0));
}
export async function reportMyAdvance(_:DepartmentFormState,f:FormData){return run(async()=>{
 const {user}=await requireAgent(),id=integer(f.get('order_id'),'Order'),value=money(f,'amount'),method=required(f,'method');
 if(!paymentMethods.filter(m=>m!=='COD').includes(method as Exclude<typeof paymentMethods[number],'COD'>))throw new PortalInputError('Choose the advance payment method.');
 if(method!=='CASH'&&!str(f,'reference'))throw new PortalInputError('Enter the payment transaction reference.');
 await transaction(async tx=>{
  const order=(await tx.query(`SELECT o.* FROM customer_orders o JOIN sales_agents a ON a.id=o.agent_id WHERE o.id=$1 AND a.user_id=$2 AND a.active=true FOR UPDATE OF o`,[id,user.id])).rows[0];
  if(!order)throw new PortalInputError('Order not found in your portal.');
  if(['CANCELLED','RETURNED'].includes(order.status))throw new PortalInputError('This order is closed for advance payment reports.');
  if(Math.round(value*100)>await paymentRoom(tx,order,true))throw new PortalInputError('Advance exceeds the remaining balance after existing payment reports.');
  const report=(await tx.query('INSERT INTO order_payment_reports(order_id,amount,method,reference,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[id,value,method,str(f,'reference'),str(f,'note'),user.id])).rows[0];
  await tx.query("UPDATE customer_orders SET payment_plan='ADVANCE',updated_at=NOW() WHERE id=$1",[id]);
  await audit(tx,user.id,'REPORT_ADVANCE','order_payment_report',Number(report.id),{order_id:id});
 });
},'Advance reported. It is awaiting verification by your manager or accounts team.');}
export async function reviewAgentAdvance(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS'),id=integer(f.get('report_id'),'Payment report'),decision=required(f,'decision');
 if(!['VERIFIED','REJECTED'].includes(decision))throw new PortalInputError('Choose verify or reject.');
 if(decision==='REJECTED'&&!str(f,'review_note'))throw new PortalInputError('Enter the rejection reason.');
 await transaction(async tx=>{
  const reportRef=(await tx.query('SELECT order_id FROM order_payment_reports WHERE id=$1',[id])).rows[0];if(!reportRef)throw new PortalInputError('Report not found.');
  const order=(await tx.query('SELECT * FROM customer_orders WHERE id=$1 FOR UPDATE',[reportRef.order_id])).rows[0];
  const report=(await tx.query('SELECT * FROM order_payment_reports WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(report.status!=='PENDING')throw new PortalInputError('This advance has already been reviewed.');
  let paymentId=null;
  if(decision==='VERIFIED'){
   if(['CANCELLED','RETURNED'].includes(order.status))throw new PortalInputError('This order is closed. Reject the report and resolve any refund separately.');
   if(Math.round(Number(report.amount)*100)>await paymentRoom(tx,order,false))throw new PortalInputError('Advance exceeds the current customer amount due. Check existing payments.');
   paymentId=(await tx.query(`INSERT INTO customer_order_payments(order_id,kind,amount,method,reference,note,created_by) VALUES($1,'COLLECTION',$2,$3,$4,$5,$6) RETURNING id`,[order.id,report.amount,report.method,report.reference,'Verified agent advance: '+report.note,user.id])).rows[0].id;
  }
  await tx.query('UPDATE order_payment_reports SET status=$1,reviewed_by=$2,reviewed_at=NOW(),review_note=$3,payment_id=$4 WHERE id=$5',[decision,user.id,str(f,'review_note'),paymentId,id]);
  await audit(tx,user.id,decision==='VERIFIED'?'VERIFY_ADVANCE':'REJECT_ADVANCE','order_payment_report',id,{order_id:order.id,payment_id:paymentId});
 });
});}
