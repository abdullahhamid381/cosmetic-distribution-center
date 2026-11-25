'use server';

import {revalidatePath} from 'next/cache';
import {redirect,unstable_rethrow} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {dispatchPricing} from '@/lib/product-pricing';
import {pakistanToday,paymentMethods} from '@/lib/sales-team';
import {cents,fromCents,str,validatePct} from '@/lib/utils';
import type {DepartmentFormState} from '@/components/DepartmentForm';

class SaleInputError extends Error {}

function localSaleLines(form:FormData) {
 const batchIds=form.getAll('batch_id'),quantities=form.getAll('quantity');
 const firstRates=form.getAll('first_discount_pct'),secondRates=form.getAll('second_discount_pct');
 if(!batchIds.length||batchIds.length>50||batchIds.length!==quantities.length)throw new SaleInputError('Add 1–50 product rows.');
 if([firstRates,secondRates].some(rates=>rates.length!==0&&rates.length!==batchIds.length))throw new SaleInputError('Enter both discount rates for each product.');
 const requested=new Map<number,{quantity:number;first:number;second:number}>();
 for(const [index,value] of batchIds.entries()){
  const batchId=Number(value),quantity=Number(quantities[index]);
  if(!Number.isSafeInteger(batchId)||batchId<1||!Number.isSafeInteger(quantity)||quantity<1)throw new SaleInputError('Choose a batch and enter a positive whole quantity for each row.');
  const rates=[firstRates[index]??'0',secondRates[index]??'0'];
  if(rates.some(rate=>typeof rate!=='string'||rate.trim()===''||!Number.isFinite(Number(rate))||Number(rate)<0||Number(rate)>100))throw new SaleInputError('Discount rates must be between 0 and 100%.');
  const [first,second]=rates.map(validatePct);
  const existing=requested.get(batchId);
  if(existing&&(existing.first!==first||existing.second!==second))throw new SaleInputError('Use the same discount rates for repeated rows from the same batch.');
  requested.set(batchId,{quantity:(existing?.quantity??0)+quantity,first,second});
 }
 return requested;
}

export async function recordLocalSale(_:DepartmentFormState,form:FormData):Promise<DepartmentFormState> {
 const user=await requireRole('ADMIN','MANAGER');
 let id:string;
 try {
  const name=str(form,'customer_name');
  if(!name)throw new SaleInputError('Enter the customer name.');
  const requested=localSaleLines(form);
  const method=str(form,'payment_method');
  if(method!=='DUE'&&(method==='COD'||!paymentMethods.some(value=>value===method)))throw new SaleInputError('Choose a payment method or mark the sale as unpaid.');
  id=await transaction(async tx=>{
   const order=(await tx.query(`INSERT INTO customer_orders(customer_name,phone,address,city,requirements,status,source,commission_pct,broker_pct,created_by,dispatched_at,delivered_at)
    VALUES($1,$2,'','',$3,'DELIVERED','LOCAL_COUNTER',0,0,$4,NOW(),NOW()) RETURNING id`,
    [name,str(form,'phone'),str(form,'note'),user.id])).rows[0];
   let total=0;
   for(const [batchId,{quantity,first,second}] of [...requested].sort(([a],[b])=>a-b)){
    const batch=(await tx.query(`SELECT b.*,p.name,p.retail_price FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id
     WHERE b.id=$1 AND p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE) FOR UPDATE OF b`,[batchId])).rows[0];
    if(!batch)throw new SaleInputError('One of the selected batches is unavailable.');
    if(quantity>Number(batch.quantity_on_hand))throw new SaleInputError(`${batch.name} has ${batch.quantity_on_hand} units available in batch ${batch.batch_number}.`);
    const {price}=dispatchPricing(Number(batch.retail_price),first,second,0);
    total+=cents(price)*quantity;
    await tx.query(`INSERT INTO customer_order_items(order_id,batch_id,product_id,quantity,retail_price,unit_cost,original_retail_price,first_discount_pct,second_discount_pct)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[order.id,batchId,batch.product_id,quantity,price,batch.unit_cost,batch.retail_price,first,second]);
    await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand-$1 WHERE id=$2',[quantity,batchId]);
    await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by)
     VALUES($1,$2,$3,'DISPATCH',$4,'CUSTOMER_ORDER',$5,'Local customer sale',$6)`,[batchId,batch.product_id,batch.warehouse_id,-quantity,order.id,user.id]);
   }
   if(method!=='DUE'&&total>0){
    await tx.query(`INSERT INTO customer_order_payments(order_id,kind,amount,method,reference,payment_date,created_by)
     VALUES($1,'COLLECTION',$2,$3,$4,$5,$6)`,[order.id,fromCents(total),method,str(form,'payment_reference'),pakistanToday(),user.id]);
   }
   await tx.query("INSERT INTO customer_order_history(order_id,status,changed_by,note) VALUES($1,'DELIVERED',$2,'Local customer sale')",[order.id,user.id]);
   await tx.query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'CREATE_LOCAL_SALE','customer_order',$2,$3)",[user.id,order.id,JSON.stringify({total:fromCents(total),method})]);
   return String(order.id);
  });
 } catch(error){
  unstable_rethrow(error);
  if(!(error instanceof SaleInputError))console.error('Unable to record local sale',error);
  return {error:error instanceof SaleInputError?error.message:'Could not record the local sale. Please try again.'};
 }
 revalidatePath('/','layout');
 redirect('/sales-team/'+id);
}

export async function editLocalSale(_:DepartmentFormState,form:FormData):Promise<DepartmentFormState> {
 const user=await requireRole('ADMIN','MANAGER');
 const id=str(form,'invoice_id'),version=str(form,'invoice_version');
 try {
  if(!/^\d+$/.test(id))throw new SaleInputError('Invoice unavailable.');
  const name=str(form,'customer_name');
  if(!name)throw new SaleInputError('Enter the customer name.');
  const requested=localSaleLines(form);
  await transaction(async tx=>{
   const order=(await tx.query(`SELECT *,updated_at::text AS version FROM customer_orders
    WHERE id=$1 AND agent_id IS NULL FOR UPDATE`,[id])).rows[0];
   if(!order||order.status!=='DELIVERED')throw new SaleInputError('Only completed local sales that have not been returned can be edited.');
   if(order.version!==version)throw new SaleInputError('This invoice changed. Reload it before saving.');
   const previous=(await tx.query('SELECT * FROM customer_order_items WHERE order_id=$1',[id])).rows;
   const oldLines=new Map(previous.map(line=>[Number(line.batch_id),line]));
   const batchIds=[...new Set([...oldLines.keys(),...requested.keys()])].sort((a,b)=>a-b);
   let total=cents(Number(order.shipping_charge));
   for(const batchId of batchIds){
    const old=oldLines.get(batchId),line=requested.get(batchId);
    const delta=(line?.quantity??0)-Number(old?.quantity??0);
    const batch=(await tx.query(`SELECT b.*,p.name,p.retail_price,
     p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE) AS available
     FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id
     WHERE b.id=$1 FOR UPDATE OF b`,[batchId])).rows[0];
    if(!batch||(delta>0&&!batch.available))throw new SaleInputError('Additional stock must come from an active, non-expired batch.');
    if(delta>Number(batch.quantity_on_hand))throw new SaleInputError(`${batch.name} has only ${batch.quantity_on_hand} additional units available.`);
    if(line){
     const retail=Number(old?.original_retail_price??old?.retail_price??batch.retail_price);
     const cost=old?.unit_cost??batch.unit_cost;
     const {price}=dispatchPricing(retail,line.first,line.second,0);
     total+=cents(price)*line.quantity;
     await tx.query(`INSERT INTO customer_order_items(order_id,batch_id,product_id,quantity,retail_price,unit_cost,original_retail_price,first_discount_pct,second_discount_pct)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(order_id,batch_id) DO UPDATE SET quantity=EXCLUDED.quantity,retail_price=EXCLUDED.retail_price,
      original_retail_price=EXCLUDED.original_retail_price,first_discount_pct=EXCLUDED.first_discount_pct,second_discount_pct=EXCLUDED.second_discount_pct`,
     [id,batchId,batch.product_id,line.quantity,price,cost,retail,line.first,line.second]);
    } else {
     await tx.query('DELETE FROM customer_order_items WHERE order_id=$1 AND batch_id=$2',[id,batchId]);
    }
    if(delta!==0){
     await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand-$1 WHERE id=$2',[delta,batchId]);
     await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by)
      VALUES($1,$2,$3,'ADJUSTMENT',$4,'CUSTOMER_ORDER',$5,'Local invoice edited',$6)`,[batchId,batch.product_id,batch.warehouse_id,-delta,id,user.id]);
    }
   }
   const [payment]=(await tx.query(`SELECT COALESCE(SUM(CASE WHEN kind='COLLECTION' THEN amount ELSE -amount END),0) AS collected
    FROM customer_order_payments WHERE order_id=$1`,[id])).rows;
   if(total<cents(Number(payment.collected)))throw new SaleInputError('The invoice total cannot be lower than the payments already recorded.');
   await tx.query(`UPDATE customer_orders SET customer_name=$2,phone=$3,alternate_phone=$4,email=$5,address=$6,city=$7,requirements=$8,updated_at=NOW() WHERE id=$1`,
    [id,name,str(form,'phone'),str(form,'alternate_phone'),str(form,'email'),str(form,'address'),str(form,'city'),str(form,'note')]);
   await tx.query("INSERT INTO customer_order_history(order_id,status,changed_by,note) VALUES($1,'DELIVERED',$2,'Local invoice edited')",[id,user.id]);
   await tx.query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'EDIT_LOCAL_SALE','customer_order',$2,$3)",
    [user.id,id,JSON.stringify({previousItems:previous,items:[...requested],total:fromCents(total)})]);
  });
 } catch(error){
  unstable_rethrow(error);
  if(!(error instanceof SaleInputError))console.error('Unable to edit local sale',error);
  return {error:error instanceof SaleInputError?error.message:'Could not save changes to the local invoice.'};
 }
 revalidatePath('/','layout');
 redirect('/sales-team/'+id);
}
