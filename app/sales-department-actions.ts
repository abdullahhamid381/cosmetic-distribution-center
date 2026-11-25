'use server';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import type {PoolClient} from 'pg';
import {amount,integer,required,str,validatePct} from '@/lib/utils';
import {orderFinancials,paymentBalance,paymentMethods,validDate,pakistanToday,commissionBalance} from '@/lib/sales-team';
import type {DepartmentFormState} from '@/components/DepartmentForm';
import {revalidatePath} from 'next/cache';
import {unstable_rethrow} from 'next/navigation';
class InputError extends Error {}
function date(value:string){try{return validDate(value);}catch{throw new InputError('Enter a valid calendar date.');}}
function nonempty(f:FormData,key:string){const v=str(f,key);if(!v)throw new InputError('Please complete '+key.replaceAll('_',' ')+'.');return v;}
function number(f:FormData,key:string){const value=nonempty(f,key);if(!Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>99999999999)throw new InputError('Enter a valid '+key.replaceAll('_',' ')+'.');return amount(value);}
async function audit(tx:PoolClient,uid:number,action:string,entity:string,id:number,details:object={}){await tx.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[uid,action,entity,id,JSON.stringify(details)]);}
async function run(work:()=>Promise<void>):Promise<DepartmentFormState>{try{await work();revalidatePath('/local-sales');revalidatePath('/sales-team','layout');revalidatePath('/agent','layout');return {success:'Saved successfully.'};}catch(e){unstable_rethrow(e);return {error:e instanceof InputError?e.message:'Could not save. Check your entries and access, then try again.'};}}
async function ownedOrder(tx:PoolClient,id:number,user:{id:number;role:string}){
 const order=(await tx.query(`SELECT o.*,a.user_id FROM customer_orders o LEFT JOIN sales_agents a ON a.id=o.agent_id WHERE o.id=$1 FOR UPDATE OF o`,[id])).rows[0];
 if(!order || (user.role==='SALES' && Number(order.user_id)!==user.id))throw new InputError('Order is unavailable.');return order;
}
export async function saveAgentProfile(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER');const id=integer(f.get('agent_id'),'Agent');
 const pct=validatePct(nonempty(f,'commission_pct')),joined=date(nonempty(f,'joined_on'));
 await transaction(async tx=>{
  const agent=(await tx.query('SELECT id FROM sales_agents WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!agent)throw new InputError('Agent not found.');
  await tx.query(`UPDATE sales_agents SET phone=$1,designation=$2,territory=$3,address=$4,joined_on=$5,notes=$6,commission_pct=$7,active=$8 WHERE id=$9`,[str(f,'phone'),nonempty(f,'designation'),str(f,'territory'),str(f,'address'),joined,str(f,'notes'),pct,f.get('active')==='on',id]);
  await audit(tx,user.id,'UPDATE','sales_agent',id,{commission_pct:pct});
 });
});}
export async function saveAgentTarget(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER'),id=integer(f.get('agent_id'),'Agent');
 const month=nonempty(f,'month');if(!/^\d{4}-\d{2}$/.test(month))throw new InputError('Choose a valid target month.');date(month+'-01');
 await transaction(async tx=>{
  await tx.query(`INSERT INTO sales_agent_targets(agent_id,month,retail_target,order_target,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(agent_id,month) DO UPDATE SET retail_target=EXCLUDED.retail_target,order_target=EXCLUDED.order_target,updated_by=EXCLUDED.updated_by`,[id,month+'-01',number(f,'retail_target'),integer(f.get('order_target'),'Order target',0),user.id]);
  await audit(tx,user.id,'SET_TARGET','sales_agent',id,{month});
 });
});}
export async function recordCustomerPayment(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');const id=integer(f.get('order_id'),'Order');
 const kind=nonempty(f,'kind');if(!['COLLECTION','REFUND'].includes(kind))throw new InputError('Choose collection or refund.');
 const value=number(f,'amount');if(value<=0)throw new InputError('Amount must be greater than zero.');
 const method=nonempty(f,'method');if(!paymentMethods.includes(method as typeof paymentMethods[number]))throw new InputError('Choose a valid payment method.');
 const paymentDate=date(nonempty(f,'payment_date'));if(paymentDate>pakistanToday())throw new InputError('Payment date cannot be in the future.');
 await transaction(async tx=>{
  const order=await ownedOrder(tx,id,user);
  const sums=(await tx.query(`SELECT COALESCE((SELECT SUM(quantity*retail_price) FROM customer_order_items WHERE order_id=$1),0) AS retail_total,COALESCE((SELECT SUM(CASE WHEN kind='COLLECTION' THEN amount ELSE -amount END) FROM customer_order_payments WHERE order_id=$1),0) AS collected`,[id])).rows[0];
  const balance=paymentBalance({...order,...sums} as Parameters<typeof paymentBalance>[0]);
  if(kind==='COLLECTION' && Math.round(value*100)>Math.round(balance.due*100))throw new InputError('Collection exceeds the customer amount due.');
  if(kind==='REFUND' && Math.round(value*100)>Math.round(balance.refundDue*100))throw new InputError('Refund exceeds the refundable balance. Return or cancel the order first.');
  const row=(await tx.query(`INSERT INTO customer_order_payments(order_id,kind,amount,method,reference,note,payment_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[id,kind,value,method,str(f,'reference'),str(f,'note'),paymentDate,user.id])).rows[0];
  await audit(tx,user.id,kind,'customer_order_payment',Number(row.id),{order_id:id,amount:value});
 });
});}
export async function recordCommissionPayout(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS'),id=integer(f.get('agent_id'),'Agent');
 const value=number(f,'amount');if(value<=0)throw new InputError('Payout must be greater than zero.');
 const method=nonempty(f,'method');if(!paymentMethods.filter(m=>m!=='COD').includes(method as Exclude<typeof paymentMethods[number],'COD'>))throw new InputError('Choose a payout method.');
 const paymentDate=date(nonempty(f,'payment_date'));if(paymentDate>pakistanToday())throw new InputError('Payment date cannot be in the future.');
 await transaction(async tx=>{
  if(!(await tx.query('SELECT id FROM sales_agents WHERE id=$1 FOR UPDATE',[id])).rows[0])throw new InputError('Agent not found.');
  const orders=(await tx.query(`SELECT o.*,COALESCE(t.retail_total,0) AS retail_total,COALESCE(t.product_cost,0) AS product_cost FROM customer_orders o LEFT JOIN LATERAL (SELECT SUM(quantity*retail_price) AS retail_total,SUM(quantity*unit_cost) AS product_cost FROM customer_order_items WHERE order_id=o.id) t ON true WHERE o.agent_id=$1`,[id])).rows;
  const earned=orders.reduce((sum,o)=>sum+Math.round(orderFinancials(o as Parameters<typeof orderFinancials>[0]).netCommission*100),0)/100;
  const paid=Number((await tx.query('SELECT COALESCE(SUM(amount),0) AS paid FROM sales_commission_payouts WHERE agent_id=$1',[id])).rows[0].paid);
  if(Math.round(value*100)>Math.round(commissionBalance(earned,paid).due*100))throw new InputError('Payout exceeds the agent’s commission balance after returned-package charges and previous payouts.');
  const row=(await tx.query(`INSERT INTO sales_commission_payouts(agent_id,amount,method,reference,note,payment_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[id,value,method,str(f,'reference'),str(f,'note'),paymentDate,user.id])).rows[0];
  await audit(tx,user.id,'PAYOUT','sales_commission_payout',Number(row.id),{agent_id:id,amount:value});
 });
});}
export async function addSalesFollowup(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER','SALES'),id=integer(f.get('order_id'),'Order');
 const due=date(nonempty(f,'due_date')),note=nonempty(f,'note');
 await transaction(async tx=>{
  await ownedOrder(tx,id,user);
  const row=(await tx.query('INSERT INTO sales_followups(order_id,due_date,note,created_by) VALUES($1,$2,$3,$4) RETURNING id',[id,due,note,user.id])).rows[0];
  await audit(tx,user.id,'CREATE','sales_followup',Number(row.id),{order_id:id});
 });
});}
export async function completeSalesFollowup(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER','SALES'),id=integer(f.get('followup_id'),'Follow-up');
 await transaction(async tx=>{
  const followup=(await tx.query('SELECT * FROM sales_followups WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!followup)throw new InputError('Follow-up not found.');await ownedOrder(tx,Number(followup.order_id),user);
  if(followup.completed_at)throw new InputError('Follow-up is already complete.');
  const outcome=nonempty(f,'outcome');
  await tx.query('UPDATE sales_followups SET completed_at=NOW(),completed_by=$1,outcome=$2 WHERE id=$3',[user.id,outcome,id]);
  await tx.query('INSERT INTO customer_order_history(order_id,status,note,changed_by) SELECT id,status,$1,$2 FROM customer_orders WHERE id=$3',['Follow-up: '+outcome,user.id,followup.order_id]);
  await audit(tx,user.id,'COMPLETE','sales_followup',id);
 });
});}
export async function savePendingOrderItems(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER'),id=integer(f.get('order_id'),'Order');
 const batches=f.getAll('batch_id'),quantities=f.getAll('quantity');
 if(!batches.length || batches.length>50 || batches.length!==quantities.length || new Set(batches).size!==batches.length)throw new InputError('Add 1–50 distinct product batches with valid quantities.');
 const lines=batches.map((b,i)=>({batch:integer(b,'Batch'),qty:integer(quantities[i],'Quantity')}));
 await transaction(async tx=>{
  const order=await ownedOrder(tx,id,user);if(order.status!=='PENDING')throw new InputError('Only pending orders can have their products changed.');
  for(const line of lines){
   const batch=(await tx.query(`SELECT b.*,p.retail_price FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE b.id=$1 AND p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE)`,[line.batch])).rows[0];
   if(!batch)throw new InputError('Choose an active, unexpired product batch.');
   await tx.query(`INSERT INTO customer_order_items(order_id,batch_id,product_id,quantity,retail_price,unit_cost) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(order_id,batch_id) DO UPDATE SET quantity=EXCLUDED.quantity`,[id,line.batch,batch.product_id,line.qty,batch.retail_price,batch.unit_cost]);
  }
  await tx.query('DELETE FROM customer_order_items WHERE order_id=$1 AND NOT (batch_id=ANY($2::bigint[]))',[id,lines.map(l=>l.batch)]);
  await tx.query('UPDATE customer_orders SET updated_at=NOW() WHERE id=$1',[id]);
  await tx.query("INSERT INTO customer_order_history(order_id,status,note,changed_by) VALUES($1,'PENDING','Manager revised order products / quantities',$2)",[id,user.id]);
  await audit(tx,user.id,'UPDATE_ITEMS','customer_order',id);
 });
});}
