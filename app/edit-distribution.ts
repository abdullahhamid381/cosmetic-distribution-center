'use server';
import {dispatchCost} from '@/lib/dispatch-cost';
import {z} from 'zod';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {dispatchPricing,effectiveShopDiscount} from '@/lib/product-pricing';
import {nextStoreInvoiceNumber} from '@/lib/store-invoice-number';
import {cents,integer,str,validatePct} from '@/lib/utils';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';

const lineSchema=z.object({itemId:z.number().int().positive().optional(),batchId:z.number().int().positive(),quantity:z.number().int().nonnegative(),discountPct:z.number().min(0).max(100).transform(value=>validatePct(value)),secondDiscountPct:z.number().min(0).max(100).transform(value=>validatePct(value)).default(0),costBasis:z.enum(['FULL','MANUFACTURING','BOX','BATCH']).optional()});
export async function editDistribution(form:FormData){
 const user=await requireRole('ADMIN','MANAGER');
 const id=integer(form.get('invoice_id'),'Invoice');
 try{
 const shopId=integer(form.get('shop_id'),'Shop'),warehouseId=integer(form.get('warehouse_id'),'Warehouse');
 const lines=z.array(lineSchema).max(75).parse(JSON.parse(String(form.get('lines')))).filter(line=>line.quantity>0).map(line=>({...line,firstDiscountPct:line.discountPct,discountPct:effectiveShopDiscount(line.discountPct,line.secondDiscountPct)}));
 const brokerId=str(form,'broker_id')?integer(form.get('broker_id'),'Broker'):null;
 const pct=brokerId?validatePct(str(form,'broker_pct')):0;
 if(!Number.isFinite(pct)||pct<0||pct>100||lines.some(l=>Math.round((l.discountPct+pct)*100)>10000))throw Error('Shop and broker percentages must total at most 100%.');
 await transaction(async tx=>{
  // Match collection lock order: shop before invoice.
  const shop=(await tx.query('SELECT * FROM shops WHERE id=$1 FOR UPDATE',[shopId])).rows[0];
  if(!shop)throw Error('Shop not found.');
  const invoice=(await tx.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!invoice)throw Error('Invoice not found.');
  const old=(await tx.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id',[id])).rows;
  if(JSON.stringify(old)!==str(form,'original_lines'))throw Error('This invoice changed. Reload the edit page before saving.');
  if((await tx.query('SELECT id FROM sales_returns WHERE invoice_id=$1 LIMIT 1',[id])).rows.length)throw Error('Reverse existing returns before editing this delivery.');
  const shopChanged=shopId!==Number(invoice.shop_id);
  if(shopChanged&&Number(invoice.paid_total)>0)throw Error('Remove allocated payments before changing the shop.');
  if(brokerId&&!(await tx.query('SELECT id FROM sales_brokers WHERE id=$1',[brokerId])).rows.length)throw Error('Broker not found.');
  if(!(await tx.query('SELECT id FROM warehouses WHERE id=$1',[warehouseId])).rows.length)throw Error('Warehouse not found.');
  const oldQty=new Map<number,number>(),newQty=new Map<number,number>();
  for(const l of old)oldQty.set(Number(l.batch_id),(oldQty.get(Number(l.batch_id))||0)+Number(l.quantity));
  for(const l of lines)newQty.set(l.batchId,(newQty.get(l.batchId)||0)+l.quantity);
  const batches=new Map<number,any>();
  for(const batchId of [...new Set([...oldQty.keys(),...newQty.keys()])].sort((a,b)=>a-b)){
   const b=(await tx.query('SELECT b.*,p.retail_price,p.manufacturer_price,p.box_cost,(b.expiry_date<CURRENT_DATE) AS expired FROM batches b JOIN products p ON p.id=b.product_id WHERE b.id=$1 FOR UPDATE OF b',[batchId])).rows[0];
   if(!b)throw Error('Product batch not found.');
   if(newQty.has(batchId)&&(Number(b.warehouse_id)!==warehouseId||(b.expired&&(newQty.get(batchId)||0)>(oldQty.get(batchId)||0))))throw Error('Choose valid stock from the selected warehouse.');
   if(Number(b.quantity_on_hand)+(oldQty.get(batchId)||0)<(newQty.get(batchId)||0))throw Error('Insufficient stock for the requested quantities.');
   batches.set(batchId,b);
  }
  const outgoing=lines.map(l=>{
   const b=batches.get(l.batchId),snapshot=old.find(o=>Number(o.id)===l.itemId&&Number(o.batch_id)===l.batchId);
   const retail=Number(snapshot?.retail_unit_price??b.retail_price);
   const manufacturing=Number(snapshot?.manufacturing_unit_cost??b.manufacturer_price??b.unit_cost),box=Number(snapshot?.box_unit_cost??b.box_cost??0);
   const basis=l.costBasis??snapshot?.cost_basis??'FULL';
   if(basis==='BATCH'&&snapshot?.cost_basis!=='BATCH')throw Error('Choose a valid product cost basis.');
   const cost=dispatchCost(manufacturing,box,basis,Number(snapshot?.unit_cost??b.unit_cost));
   const {price,companyPrice:company}=dispatchPricing(retail,l.firstDiscountPct,l.secondDiscountPct,pct);
   return {...l,b,retail,cost,price,basis,manufacturing,box,total:cents(price)*l.quantity,company};
  });
  const total=outgoing.reduce((s,l)=>s+l.total,0),subtotal=outgoing.reduce((s,l)=>s+cents(l.retail)*l.quantity,0);
  if(total<cents(Number(invoice.paid_total)+Number(invoice.credit_total)))throw Error('Invoice total cannot be less than payments and credits already applied.');
  const previous=(await tx.query('SELECT COALESCE(SUM(total-paid_total-credit_total),0) AS due FROM invoices WHERE shop_id=$1 AND id<>$2',[shopId,id])).rows[0];
  if(Number(shop.credit_limit)>0&&cents(Number(previous.due))+total-cents(Number(invoice.paid_total))>cents(Number(shop.credit_limit)))throw Error('Shop credit limit exceeded.');
  for(const [batchId,b] of batches){
   const delta=(oldQty.get(batchId)||0)-(newQty.get(batchId)||0);
   if(!delta)continue;
   await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand+$1 WHERE id=$2',[delta,batchId]);
   await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by) VALUES($1,$2,$3,'ADJUSTMENT',$4,'INVOICE_EDIT',$5,$6,$7)`,[batchId,b.product_id,b.warehouse_id,delta,id,'Invoice delivery edited',user.id]);
  }
  await tx.query('DELETE FROM invoice_items WHERE invoice_id=$1',[id]);
  await tx.query('DELETE FROM delivery_items WHERE delivery_id=$1',[invoice.delivery_id]);
  for(const l of outgoing){
   await tx.query(`INSERT INTO invoice_items(invoice_id,product_id,batch_id,quantity,retail_unit_price,trade_unit_price,discount_pct,applied_unit_price,unit_cost,line_total,broker_discount_pct,company_unit_price,cost_basis,manufacturing_unit_cost,box_unit_cost,first_discount_pct,second_discount_pct) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[id,l.b.product_id,l.batchId,l.quantity,l.retail,l.price,l.discountPct,l.price,l.cost,l.total/100,pct,l.company,l.basis,l.manufacturing,l.box,l.firstDiscountPct,l.secondDiscountPct]);
   await tx.query('INSERT INTO delivery_items(delivery_id,product_id,batch_id,quantity) VALUES($1,$2,$3,$4)',[invoice.delivery_id,l.b.product_id,l.batchId,l.quantity]);
  }
  const hasWrongStorePrefix=/-INV-\d+$/.test(invoice.invoice_no??'')
    && !invoice.invoice_no.startsWith(`${shop.store_code}-INV-`);
  const invoiceNo=shopChanged||hasWrongStorePrefix
    ? await nextStoreInvoiceNumber(tx,shopId)
    : invoice.invoice_no;
  await tx.query('UPDATE invoices SET shop_id=$1,note=$2,subtotal=$3,discount_total=$4,total=$5,broker_id=$6,broker_pct=$7,invoice_no=$8 WHERE id=$9',[shopId,str(form,'note'),subtotal/100,(subtotal-total)/100,total/100,brokerId,pct,invoiceNo,id]);
  await tx.query('UPDATE deliveries SET shop_id=$1,warehouse_id=$2 WHERE id=$3',[shopId,warehouseId,invoice.delivery_id]);
  await tx.query(`INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'EDIT_INVOICE_AND_DELIVERY','invoice',$2,$3)`,[user.id,id,JSON.stringify({before:invoice,oldLines:old,after:{shopId,warehouseId,lines,brokerId,pct,invoiceNo,total:total/100}})]);
 });
 }catch(error){redirect(`/manage/invoices/${id}?error=${encodeURIComponent(error instanceof Error?error.message:'Unable to save delivery.')}`);}
 revalidatePath('/','layout');redirect(`/invoices/${id}`);
}
