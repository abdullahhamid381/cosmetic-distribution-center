'use server';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {amount,integer,required,str,validatePct} from '@/lib/utils';
import {canTransition,orderStatuses,OrderStatus,paymentPlans,paymentMethods} from '@/lib/sales-team';
import {revalidatePath} from 'next/cache';
import {redirect,unstable_rethrow} from 'next/navigation';
import type {DepartmentFormState} from '@/components/DepartmentForm';
class OrderInputError extends Error {}
function refresh(path:string) {revalidatePath('/sales-team','layout');revalidatePath('/agent','layout');redirect(path);}
export async function saveSalesAgent(form:FormData) {
 const user=await requireRole('ADMIN','MANAGER');
 const userId=integer(form.get('user_id'),'Sales user');
 await transaction(async tx=>{
  const member=(await tx.query("SELECT id FROM users WHERE id=$1 AND role='SALES' AND active=true FOR UPDATE",[userId])).rows[0];
  if(!member) throw new OrderInputError('Choose an active SALES staff account.');
  const agent=(await tx.query(`INSERT INTO sales_agents(user_id,phone,commission_pct,active) VALUES($1,$2,$3,$4)
  ON CONFLICT(user_id) DO UPDATE SET phone=EXCLUDED.phone,commission_pct=EXCLUDED.commission_pct,active=EXCLUDED.active RETURNING id`,[userId,str(form,'phone'),validatePct(required(form,'commission_pct')),form.get('active')==='on'])).rows[0];
  await tx.query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'UPDATE','sales_agent',$2,$3)",[user.id,agent.id,JSON.stringify({commission_pct:form.get('commission_pct')})]);
 });
 refresh('/sales-team/agents');
}
export async function createCustomerOrder(form:FormData) {
 const user=await requireRole('ADMIN','MANAGER','SALES');
 const products=form.getAll('product_id');
 const ids=products.length?products:form.getAll('batch_id'), quantities=form.getAll('quantity');
 if(user.role==='SALES'&&!products.length)throw new OrderInputError('Select products in your agent portal.');
 if(ids.length!==quantities.length)throw new OrderInputError('Enter a quantity for each product.');
 const lines=ids.map((id,i)=>({batch:integer(id,'Batch'),quantity:integer(quantities[i],'Quantity')}));
 if(!lines.length || lines.length>50 || new Set(lines.map(l=>l.batch)).size!==lines.length) throw new OrderInputError('Add 1–50 distinct product batches.');
 const id=await transaction(async tx=>{
  const agent=(await tx.query(`SELECT a.* FROM sales_agents a JOIN users u ON u.id=a.user_id WHERE ${user.role==='SALES'?'a.user_id':'a.id'}=$1 AND a.active AND u.active AND u.role='SALES' FOR SHARE OF a,u`,[user.role==='SALES'?user.id:integer(form.get('agent_id'),'Agent')])).rows[0];
  if(!agent || (user.role==='SALES' && Number(agent.user_id)!==user.id)) throw new OrderInputError('Select your active sales agent profile.');
  const priority=str(form,'priority')||'NORMAL';if(!['NORMAL','HIGH','URGENT'].includes(priority))throw new OrderInputError('Choose a valid priority.');
  const brokerId=str(form,'broker_id')?integer(form.get('broker_id'),'Broker'):null;
  const broker=brokerId?(await tx.query('SELECT id,commission_pct FROM sales_brokers WHERE id=$1 AND active=true FOR SHARE',[brokerId])).rows[0]:null;
  if(brokerId&&!broker)throw new OrderInputError('Choose an active broker.');
  const salesPct=user.role==='SALES'?Number(agent.commission_pct):form.has('commission_pct')?validatePct(required(form,'commission_pct')):Number(agent.commission_pct);
  const brokerPct=user.role!=='SALES'&&form.has('broker_pct')?validatePct(required(form,'broker_pct')):Number(broker?.commission_pct??10);
  if(salesPct+(brokerId?brokerPct:0)>100)throw new OrderInputError('Combined sales and broker percentages cannot exceed 100%.');
  const plan=str(form,'payment_plan')||'PENDING';if(!paymentPlans.includes(plan as typeof paymentPlans[number]))throw new OrderInputError('Choose cash on delivery, advance payment or pending payment.');
  const order=(await tx.query(`INSERT INTO customer_orders(agent_id,customer_name,phone,alternate_phone,address,city,requirements,shipping_charge,commission_pct,created_by,email,landmark,postal_code,source,priority,payment_plan)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,[agent.id,required(form,'customer_name'),required(form,'phone'),str(form,'alternate_phone'),required(form,'address'),required(form,'city'),str(form,'requirements'),amount(required(form,'shipping_charge')),salesPct,user.id,str(form,'email'),str(form,'landmark'),str(form,'postal_code'),str(form,'source')||'DIRECT',priority,plan])).rows[0];
  await tx.query("UPDATE customer_orders SET commission_basis='RETAIL',broker_id=$1,broker_pct=$2 WHERE id=$3",[brokerId,brokerPct,order.id]);
  const allocated:{batch:number;quantity:number}[]=[];
  if(products.length){
   for(const line of lines){
    const available=(await tx.query(`SELECT b.id,b.quantity_on_hand FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=$1 AND p.active AND w.active AND b.quantity_on_hand>0 AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE) ORDER BY b.expiry_date ASC NULLS LAST,b.id`,[line.batch])).rows;
    let remaining=line.quantity;
    for(const b of available){const qty=Math.min(remaining,Number(b.quantity_on_hand));if(qty>0)allocated.push({batch:Number(b.id),quantity:qty});remaining-=qty;if(remaining===0)break;}
    if(remaining>0)throw new OrderInputError('One of the selected products has insufficient available stock. Reduce its quantity or contact your manager.');
   }
  }else allocated.push(...lines);
  let retailCents=0;
  for(const line of allocated){
   const batch=(await tx.query(`SELECT b.*,p.retail_price FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE b.id=$1 AND p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE)`,[line.batch])).rows[0];
   if(!batch) throw new OrderInputError('Product batch is unavailable.');
   retailCents+=Math.round(Number(batch.retail_price)*100)*line.quantity;
   await tx.query(`INSERT INTO customer_order_items(order_id,batch_id,product_id,quantity,retail_price,unit_cost) VALUES($1,$2,$3,$4,$5,$6)`,[order.id,line.batch,batch.product_id,line.quantity,batch.retail_price,batch.unit_cost]);
  }
  if(plan==='ADVANCE'){
   const advance=amount(required(form,'advance_amount')),method=required(form,'advance_method');
   if(advance<=0||Math.round(advance*100)>retailCents+Math.round(amount(required(form,'shipping_charge'))*100))throw new OrderInputError('Advance must be greater than zero and cannot exceed the order total.');
   if(!paymentMethods.filter(m=>m!=='COD').includes(method as Exclude<typeof paymentMethods[number],'COD'>))throw new OrderInputError('Choose a valid advance payment method.');
   if(method!=='CASH'&&!str(form,'advance_reference'))throw new OrderInputError('Enter the advance transaction reference.');
   await tx.query('INSERT INTO order_payment_reports(order_id,amount,method,reference,note,created_by) VALUES($1,$2,$3,$4,$5,$6)',[order.id,advance,method,str(form,'advance_reference'),str(form,'advance_note'),user.id]);
  }
  await tx.query("INSERT INTO customer_order_history(order_id,status,changed_by,note) VALUES($1,'PENDING',$2,'Order submitted')",[order.id,user.id]);
  await tx.query("INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,'CREATE','customer_order',$2)",[user.id,order.id]);
  return order.id;
 });
 refresh(user.role==='SALES'?'/agent/orders/'+id:'/sales-team/'+id);
}
async function persistCustomerOrder(form:FormData) {
 const user=await requireRole('ADMIN','MANAGER');
 const id=integer(form.get('order_id'),'Order');
 const status=required(form,'status') as OrderStatus;
 if(!orderStatuses.includes(status)) throw new OrderInputError('Invalid order status.');
 await transaction(async tx=>{
  const old=(await tx.query('SELECT * FROM customer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!old || !canTransition(old.status,status)) throw new OrderInputError('This status change is not allowed.');
  const local=old.agent_id===null;
  const commissionPct=local?0:form.has('commission_pct')?validatePct(required(form,'commission_pct')):Number(old.commission_pct||0);
  const basis=str(form,'commission_basis')||old.commission_basis||'PROFIT';if(!['RETAIL','PROFIT'].includes(basis))throw new OrderInputError('Choose a valid commission basis.');
  const brokerId=local?null:form.has('broker_id')?(str(form,'broker_id')?integer(form.get('broker_id'),'Broker'):null):(old.broker_id||null);
  if(brokerId&&String(brokerId)!==String(old.broker_id)){
   if(!(await tx.query('SELECT id FROM sales_brokers WHERE id=$1 AND active=true FOR SHARE',[brokerId])).rows[0])throw new OrderInputError('Choose an active broker.');
  }
  const brokerPct=form.has('broker_pct')?validatePct(required(form,'broker_pct')):Number(old.broker_pct??10);
  if(commissionPct+(brokerId?brokerPct:0)>100)throw new OrderInputError('Combined sales and broker percentages cannot exceed 100%.');
  if(old.status!==status && ['RETURNED','CANCELLED'].includes(status) && !str(form,'status_note'))throw new OrderInputError('Enter a reason for the cancellation or return in the status note.');
  const courier=str(form,'courier_name'),tracking=str(form,'tracking_number');
  if(!local && ['DISPATCHED','DELIVERED'].includes(status) && (!courier || !tracking)) throw new OrderInputError('Courier and tracking number are required to dispatch or deliver.');
  const dispatch=old.status==='PENDING' && status==='DISPATCHED';
  const restore=['DISPATCHED','DELIVERED'].includes(old.status) && status==='RETURNED';
  if(dispatch || restore){
   const lines=(await tx.query('SELECT * FROM customer_order_items WHERE order_id=$1 ORDER BY batch_id',[id])).rows;
   for(const line of lines){
    const batch=(await tx.query(`SELECT b.*,p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE) AS dispatchable
     FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE b.id=$1 FOR UPDATE OF b`,[line.batch_id])).rows[0];
    if(!batch || (dispatch && (Number(batch.quantity_on_hand)<line.quantity || !batch.dispatchable))) throw new OrderInputError('Insufficient, inactive or expired stock. Receive valid stock before dispatching.');
    const delta=(dispatch?-1:1)*line.quantity;
    await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand+$1 WHERE id=$2',[delta,batch.id]);
    await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by) VALUES($1,$2,$3,$4,$5,'CUSTOMER_ORDER',$6,$7,$8)`,[batch.id,batch.product_id,batch.warehouse_id,dispatch?'DISPATCH':'RETURN',delta,id,`Customer order CO-${id}`,user.id]);
   }
  }
  await tx.query(`UPDATE customer_orders SET customer_name=$1,phone=$2,alternate_phone=$3,address=$4,city=$5,requirements=$6,status=$7,courier_name=$8,tracking_number=$9,shipping_charge=$10,courier_cost=$11,shipping_cost=$12,return_cost=$13,updated_at=NOW() WHERE id=$14`,[required(form,'customer_name'),local?str(form,'phone'):required(form,'phone'),str(form,'alternate_phone'),local?str(form,'address'):required(form,'address'),local?str(form,'city'):required(form,'city'),str(form,'requirements'),status,courier,tracking,amount(required(form,'shipping_charge')),amount(required(form,'courier_cost')),amount(required(form,'shipping_cost')),amount(required(form,'return_cost')),id]);
  const priority=str(form,'priority')||old.priority||'NORMAL';if(!['NORMAL','HIGH','URGENT'].includes(priority))throw new OrderInputError('Choose a valid priority.');
  const expected=str(form,'expected_delivery');if(expected && (!/^\d{4}-\d{2}-\d{2}$/.test(expected)||!Number.isFinite(Date.parse(expected))||new Date(expected+'T00:00:00Z').toISOString().slice(0,10)!==expected))throw new OrderInputError('Enter a valid expected delivery date.');
  await tx.query(`UPDATE customer_orders SET email=$1,landmark=$2,postal_code=$3,source=$4,priority=$5,expected_delivery=$6,
   dispatched_at=CASE WHEN $7='DISPATCHED' THEN COALESCE(dispatched_at,NOW()) ELSE dispatched_at END,
   delivered_at=CASE WHEN $7='DELIVERED' THEN COALESCE(delivered_at,NOW()) ELSE delivered_at END,
   returned_at=CASE WHEN $7='RETURNED' THEN COALESCE(returned_at,NOW()) ELSE returned_at END,commission_pct=$9,broker_id=$10,broker_pct=$11,commission_basis=$12 WHERE id=$8`,[str(form,'email'),str(form,'landmark'),str(form,'postal_code'),local?'LOCAL_COUNTER':str(form,'source')||'DIRECT',priority,expected||null,status,id,commissionPct,brokerId,brokerPct,basis]);
  await tx.query('INSERT INTO customer_order_history(order_id,status,changed_by,note) VALUES($1,$2,$3,$4)',[id,status,user.id,str(form,'status_note')]);
  const returnChargeDeduction=status==='RETURNED'?amount(required(form,'courier_cost'))+amount(required(form,'shipping_cost'))+amount(required(form,'return_cost')):0;
  const oldReturnChargeDeduction=old.status==='RETURNED'?Number(old.courier_cost||0)+Number(old.shipping_cost||0)+Number(old.return_cost||0):0;
  await tx.query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'UPDATE','customer_order',$2,$3)",[user.id,id,JSON.stringify({from:old.status,to:status,old_commission_pct:old.commission_pct,commission_pct:commissionPct,old_broker_id:old.broker_id,broker_id:brokerId,broker_pct:brokerPct,commission_basis:basis,old_return_charge_deduction:oldReturnChargeDeduction,return_charge_deduction:returnChargeDeduction})]);
 });
 revalidatePath('/local-sales');revalidatePath('/inventory');revalidatePath('/sales-team','layout');revalidatePath('/agent','layout');
 return {id,status};
}
export async function updateCustomerOrder(form:FormData) {const result=await persistCustomerOrder(form);refresh('/sales-team/'+result.id);}
export async function submitCustomerOrder(_:DepartmentFormState,form:FormData):Promise<DepartmentFormState>{try{await createCustomerOrder(form);return {};}catch(e){unstable_rethrow(e);return {error:e instanceof OrderInputError?e.message:'Could not submit. Complete all required details and choose your active agent profile.'};}}
export async function processCustomerOrder(_:DepartmentFormState,form:FormData):Promise<DepartmentFormState>{try{const result=await persistCustomerOrder(form);return {success:`Order CO-${result.id} saved successfully. Current status: ${result.status}.`};}catch(e){unstable_rethrow(e);return {error:e instanceof OrderInputError?e.message:'Could not save. Check required details, amounts and your permissions.'};}}
export async function enableSalesAgent(_:DepartmentFormState,form:FormData):Promise<DepartmentFormState>{try{await saveSalesAgent(form);return {};}catch(e){unstable_rethrow(e);return {error:e instanceof OrderInputError?e.message:'Could not add agent. Select an active SALES staff account and a percentage from 0 to 100.'};}}
