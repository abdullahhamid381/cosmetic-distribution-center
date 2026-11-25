'use server';
import { unstable_rethrow, redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaction } from '@/lib/db';
import { createSession, destroySession, requireRole, requireUser,currentUser, type CurrentUser } from '@/lib/auth';
import { amount, cents, fromCents, integer, required, str, validatePct, dateISO, roleSchema } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import type { PoolClient } from 'pg';
import {readPaymentReceipt,savePaymentReceipt} from '@/lib/payment-receipts';
import {dispatchCost,type DispatchCostBasis} from '@/lib/dispatch-cost';
import {dispatchPricing,effectiveShopDiscount} from '@/lib/product-pricing';
import {nextStoreInvoiceNumber} from '@/lib/store-invoice-number';
import {invoiceDueDate} from '@/lib/invoice-dates';
import {pakistanToday} from '@/lib/closing-period';
import {validDate} from '@/lib/sales-team';
import type {FieldCollectionLine} from '@/lib/field-sales';

const done = (path:string) => { revalidatePath('/', 'layout'); redirect(path); };
async function audit(tx:PoolClient, uid:number, action:string, entity:string, entityId:number, details:Record<string,unknown> = {}) {
  await tx.query('INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[uid,action,entity,entityId,JSON.stringify(details)]);
}
export async function login(form:FormData) {
  const agentLogin=str(form,'portal_login')==='agent';
  const loginPath=agentLogin?'/agent-login':'/login';
  const email = required(form,'email').toLowerCase(); const password = required(form,'password');
  try {
    const [user] = await query('SELECT id,password_hash,active,role FROM users WHERE email=$1',[email]);
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash)) || (agentLogin && user.role!=='SALES')) redirect(loginPath+'?error=invalid');
    if(user.role==='SALES' && !(await query('SELECT id FROM sales_agents WHERE user_id=$1 AND active=true',[user.id]))[0])redirect('/agent-login?error=disabled');
    await createSession(Number(user.id));
    redirect(user.role==='DELIVERY'?'/deliveries':user.role==='WAREHOUSE'?'/inventory':user.role==='SALES'?'/agent':user.role==='FIELD_SALES'?'/field':'/dashboard');
  } catch(error) {
    unstable_rethrow(error);
    const code=(error as {code?:unknown}|null)?.code;
    if(typeof code==='string'&&['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH'].includes(code)){
      console.error('Database connection failed during sign-in',code);
      redirect(loginPath+'?error=unavailable');
    }
    throw error;
  }
}
export async function logout() {const user=await currentUser();await destroySession();redirect(user?.role==='SALES'?'/agent-login':'/login');}
export async function createProduct(form: FormData) {
  const user = await requireRole('ADMIN','MANAGER');
  const sku=required(form,'sku').toUpperCase(), name=required(form,'name');
  const retail=amount(required(form,'retail_price'));
  const manufacturerPrice=amount(required(form,'manufacturer_price'));
  const boxCost=amount(str(form,'box_cost')||0);
  const landed=(cents(manufacturerPrice)+cents(boxCost))/100;
  // Legacy catalogue trade column is retained for compatibility; dispatch sets invoice trade prices.
  const trade=retail;
  const id = await transaction(async tx => {
    const row=(await tx.query(`INSERT INTO products(sku,name,brand,category,size_label,manufacturer_price,landed_cost,trade_price,retail_price,min_stock,manufacturer_id,barcode,box_cost)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[
      sku,name,str(form,'brand')||'GLANŹE',str(form,'category'),str(form,'size_label'),manufacturerPrice,landed,trade,retail,integer(form.get('min_stock')||0,'Minimum stock',0),
      str(form,'manufacturer_id') ? integer(form.get('manufacturer_id'),'manufacturer') : null,str(form,'barcode') || null,boxCost])).rows[0];
    await audit(tx,user.id,'CREATE','product',Number(row.id)); return row.id;
  });
  done('/products?created='+id);
}
export async function updateProductPrices(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  const id=integer(form.get('id'),'Product');
  const retail=amount(required(form,'retail_price'));
  const manufacturing=amount(required(form,'manufacturer_price')),box=amount(str(form,'box_cost')||0);
  await transaction(async tx=>{
    await tx.query('UPDATE products SET manufacturer_price=$1,retail_price=$2,min_stock=$3,box_cost=$5,landed_cost=$6 WHERE id=$4',[
      manufacturing,retail,integer(form.get('min_stock'),'Minimum stock',0),id,box,(cents(manufacturing)+cents(box))/100]);
    await audit(tx,user.id,'UPDATE_PRICES','product',id);
  });
  done('/products?updated='+id);
}
export async function createShop(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  const pct=str(form,'default_discount');
  if(user.role==='SALES' && pct!=='') throw new Error('A manager must approve a custom shop discount percentage.');
  const id=await transaction(async tx=>{
    const row=(await tx.query(`INSERT INTO shops(shop_name,contact_name,phone,address,city,region,default_discount,credit_limit,payment_terms_days,assigned_sales_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[
      required(form,'shop_name'),str(form,'contact_name'),str(form,'phone'),str(form,'address'),str(form,'city'),str(form,'region'),pct===''?null:validatePct(pct),amount(str(form,'credit_limit')||0),integer(form.get('payment_terms_days')||30,'Payment terms',0),user.role==='SALES'?user.id:null])).rows[0];
    await audit(tx,user.id,'CREATE','shop',Number(row.id));return row.id;
  });
  done('/shops/'+id);
}
export async function updateShop(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  const id=integer(form.get('shop_id'),'Shop');
  const pct=str(form,'default_discount');
  await transaction(async tx=>{
    const old=(await tx.query('SELECT default_discount FROM shops WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!old) throw new Error('Shop not found');
    const newPct=pct===''?null:validatePct(pct);
    await tx.query(`UPDATE shops SET shop_name=$1,contact_name=$2,phone=$3,address=$4,city=$5,region=$6,default_discount=$7,credit_limit=$8,payment_terms_days=$9 WHERE id=$10`,[
      required(form,'shop_name'),str(form,'contact_name'),str(form,'phone'),str(form,'address'),str(form,'city'),str(form,'region'),newPct,amount(str(form,'credit_limit')||0),integer(form.get('payment_terms_days')||30,'terms',0),id]);
    await tx.query('INSERT INTO price_audit(shop_id,old_pct,new_pct,changed_by) VALUES($1,$2,$3,$4)',[id,old.default_discount,newPct,user.id]);
    await audit(tx,user.id,'UPDATE','shop',id);
  });
  done('/shops/'+id+'?updated=1');
}
export async function setShopProductDiscount(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  const shop=integer(form.get('shop_id'),'Shop'), product=integer(form.get('product_id'),'Product');
  const raw=str(form,'discount_pct');
  await transaction(async tx=>{
    const old=(await tx.query('SELECT discount_pct FROM shop_product_rates WHERE shop_id=$1 AND product_id=$2',[shop,product])).rows[0];
    if(raw==='') await tx.query('DELETE FROM shop_product_rates WHERE shop_id=$1 AND product_id=$2',[shop,product]);
    else await tx.query(`INSERT INTO shop_product_rates(shop_id,product_id,discount_pct) VALUES($1,$2,$3)
     ON CONFLICT(shop_id,product_id) DO UPDATE SET discount_pct=EXCLUDED.discount_pct,updated_at=NOW()`,[shop,product,validatePct(raw)]);
    await tx.query('INSERT INTO price_audit(shop_id,product_id,old_pct,new_pct,changed_by) VALUES($1,$2,$3,$4,$5)',[shop,product,old?.discount_pct??null,raw===''?null:validatePct(raw),user.id]);
    await audit(tx,user.id,'CHANGE_DISCOUNT','shop',shop,{product});
  });
  done('/shops/'+shop+'?pricing=updated');
}
export async function createManufacturer(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  await transaction(async tx=>{const m=(await tx.query('INSERT INTO manufacturers(name,phone) VALUES($1,$2) RETURNING id',[required(form,'name'),str(form,'phone')])).rows[0];await audit(tx,user.id,'CREATE','manufacturer',Number(m.id));});
  done('/products');
}
export async function createWarehouse(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  await transaction(async tx=>{const w=(await tx.query('INSERT INTO warehouses(name,location) VALUES($1,$2) RETURNING id',[required(form,'name'),str(form,'location')])).rows[0];await audit(tx,user.id,'CREATE','warehouse',Number(w.id));});
  done('/inventory');
}
class StockReceiptError extends Error {}
export async function receiveStock(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER','WAREHOUSE');
  let productId:number,warehouseId:number,qty:number,cost:number,batchNumber:string,mfg:string|null,expiry:string|null;
  try {
  productId=integer(form.get('product_id'),'Product');
  warehouseId=integer(form.get('warehouse_id'),'Warehouse');
  qty=integer(form.get('quantity'),'Quantity');
  batchNumber=required(form,'batch_number');
  cost=amount(required(form,'unit_cost'));
  mfg=str(form,'manufacture_date')||null; expiry=str(form,'expiry_date')||null;
  if(mfg) dateISO(mfg); if(expiry) dateISO(expiry);
  if(mfg && expiry && mfg >= expiry) throw new Error('Expiry date must follow manufacturing date');
  } catch(error) { return {error:error instanceof Error?error.message:'Check the receipt details.'}; }
  try {
  await transaction(async tx=>{
    const product=(await tx.query('SELECT id FROM products WHERE id=$1 AND active=true FOR SHARE',[productId])).rows[0];
    if(!product) throw new StockReceiptError('This product is missing or inactive. Choose an active product.');
    const warehouse=(await tx.query('SELECT id FROM warehouses WHERE id=$1 AND active=true FOR SHARE',[warehouseId])).rows[0];
    if(!warehouse) throw new StockReceiptError('This warehouse is missing or inactive. Choose an active warehouse.');
    // Upsert on unique batch key. For repeat receipts, reject a conflicting cost to protect valuations.
    const batch=(await tx.query(`INSERT INTO batches(product_id,warehouse_id,batch_number,manufacture_date,expiry_date,unit_cost,quantity_on_hand)
      VALUES($1,$2,$3,$4,$5,$6,0)
      ON CONFLICT(product_id,warehouse_id,batch_number) DO UPDATE SET batch_number=EXCLUDED.batch_number
      RETURNING id, unit_cost,
        to_char(manufacture_date, 'YYYY-MM-DD') AS manufacture_date,
        to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date`,
      [productId,warehouseId,batchNumber,mfg,expiry,cost])).rows[0];
    if(cents(Number(batch.unit_cost))!==cents(cost)) throw new StockReceiptError(`Batch ${batchNumber} already exists with unit cost Rs. ${Number(batch.unit_cost).toFixed(2)}. You entered Rs. ${cost.toFixed(2)}. Use the existing cost to add to this batch, or enter a different batch reference for stock received at a different cost.`);
    // Keep SQL DATE values as calendar dates; converting local midnight to UTC can change the day.
    if (mfg && batch.manufacture_date && batch.manufacture_date!==mfg) throw new StockReceiptError(`Batch ${batchNumber} has manufacturing date ${batch.manufacture_date}. Use that date or a different batch reference.`);
    if (expiry && batch.expiry_date && batch.expiry_date!==expiry) throw new StockReceiptError(`Batch ${batchNumber} has expiry date ${batch.expiry_date}. Use that date or a different batch reference.`);
    await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand+$1 WHERE id=$2',[qty,batch.id]);
    await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,note,created_by)
      VALUES($1,$2,$3,'RECEIPT',$4,'MANUFACTURER',$5,$6)`,[batch.id,productId,warehouseId,qty,str(form,'note'),user.id]);
    await audit(tx,user.id,'RECEIVE_STOCK','batch',Number(batch.id),{qty});
  });
  } catch(error) {
    if(error instanceof StockReceiptError) return {error:error.message};
    return {error:'Stock could not be received. Please try again. No stock changes were saved.'};
  }
  done('/inventory?received=1');
}
export async function transferStock(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER','WAREHOUSE');
  const batchId=integer(form.get('source_batch_id'),'Source batch');
  const destinationId=integer(form.get('destination_warehouse_id'),'Destination warehouse');
  const qty=integer(form.get('quantity'),'Quantity');
  const note=str(form,'note');
  await transaction(async tx=>{
    const src=(await tx.query('SELECT * FROM batches WHERE id=$1 FOR UPDATE',[batchId])).rows[0];
    if(!src) throw new Error('Source batch not found');
    if(Number(src.warehouse_id)===destinationId) throw new Error('Choose a different destination warehouse');
    if(Number(src.quantity_on_hand)<qty) throw new Error('Insufficient stock to transfer');
    const wh=(await tx.query('SELECT id FROM warehouses WHERE id=$1 AND active=true FOR SHARE',[destinationId])).rows[0];
    if(!wh) throw new Error('Destination warehouse is invalid');
    const dst=(await tx.query(`INSERT INTO batches(product_id,warehouse_id,batch_number,manufacture_date,expiry_date,unit_cost,quantity_on_hand)
      VALUES($1,$2,$3,$4,$5,$6,0) ON CONFLICT(product_id,warehouse_id,batch_number)
      DO UPDATE SET batch_number=EXCLUDED.batch_number RETURNING *`,
      [src.product_id,destinationId,src.batch_number,src.manufacture_date,src.expiry_date,src.unit_cost])).rows[0];
    if(cents(Number(dst.unit_cost))!==cents(Number(src.unit_cost))) throw new Error('Destination batch has a different unit cost; contact an administrator.');
    await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand-$1 WHERE id=$2',[qty,batchId]);
    await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand+$1 WHERE id=$2',[qty,dst.id]);
    const transfer=(await tx.query('INSERT INTO stock_transfers(source_batch_id,destination_batch_id,quantity,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [batchId,dst.id,qty,note,user.id])).rows[0];
    const transferId=Number(transfer.id);
    for(const [batch,delta,type] of [[src,-qty,'TRANSFER_OUT'],[dst,qty,'TRANSFER_IN']] as const) {
      await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by)
        VALUES($1,$2,$3,$4,$5,'TRANSFER',$6,$7,$8)`,[batch.id,batch.product_id,batch.warehouse_id,type,delta,transferId,note,user.id]);
    }
    await audit(tx,user.id,'WAREHOUSE_TRANSFER','stock_transfer',transferId,{qty,source:batchId,destination:destinationId});
  });
  done('/inventory?transferred=1');
}
export async function adjustStock(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  const id=integer(form.get('batch_id'),'Batch'); const delta=Number(required(form,'quantity_delta'));
  if(!Number.isSafeInteger(delta) || delta===0) throw new Error('Nonzero integer adjustment required');
  const note=required(form,'reason');
  await transaction(async tx=>{
    const row=(await tx.query('SELECT * FROM batches WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!row || Number(row.quantity_on_hand)+delta<0) throw new Error('Insufficient stock for adjustment');
    await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand+$1 WHERE id=$2',[delta,id]);
    await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,note,created_by)
      VALUES($1,$2,$3,'ADJUSTMENT',$4,'MANUAL',$5,$6)`,[id,row.product_id,row.warehouse_id,delta,note,user.id]);
    await audit(tx,user.id,'ADJUST_STOCK','batch',id,{delta,note});
  });
  done('/inventory?adjusted=1');
}
type SaleFormState={error?:string;stock?:{batchId:number;available:number;requested:number}};
class DispatchValidationError extends Error{constructor(message:string,public stock?:SaleFormState['stock']){super(message);}}
export async function submitSale(_:SaleFormState,form:FormData):Promise<SaleFormState>{
 try{await createSale(form);return {};}catch(error){
  unstable_rethrow(error);
  if(error instanceof DispatchValidationError)return {error:error.message,...(error.stock?{stock:error.stock}:{})};
  if(error instanceof z.ZodError)return {error:'Check product selections, whole-number quantities, percentages and cost choices.'};
  return {error:'Unable to create delivery. Check your entries and refresh stock availability before trying again.'};
 }
}
const saleLine = z.object({batchId:z.number().int().positive(), quantity:z.number().int().positive(),discountPct:z.number().min(0).max(100).transform(value=>validatePct(value)),secondDiscountPct:z.number().min(0).max(100).transform(value=>validatePct(value)).default(0),costBasis:z.enum(['FULL','MANUFACTURING','BOX']).default('FULL')}).transform(line=>({...line,firstDiscountPct:line.discountPct,discountPct:effectiveShopDiscount(line.discountPct,line.secondDiscountPct)}));
export async function createSale(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER');
  const shopId=integer(form.get('shop_id'),'Shop');
  const warehouseId=integer(form.get('warehouse_id'),'Warehouse');
  const lines=z.array(saleLine).min(1).max(75).parse(JSON.parse(required(form,'lines')));
  const bookingId=str(form,'field_booking_id')?integer(form.get('field_booking_id'),'Booking'):null;
  const brokerId=str(form,'broker_id')?integer(form.get('broker_id'),'Broker'):null;
  const brokerPct=brokerId?validatePct(required(form,'broker_pct')):0;
  if(lines.some(line=>Math.round((line.discountPct+brokerPct)*100)>10000))throw new DispatchValidationError('Shop and broker percentages combined cannot exceed 100%.');
  const grouped=new Map<number,number>();
  for(const line of lines) grouped.set(line.batchId,(grouped.get(line.batchId)||0)+line.quantity);
  let createdId=0;
  await transaction(async tx=>{
    // Lock the shop and batches, protecting credit limits and stock against concurrent sales.
    const shop=(await tx.query('SELECT * FROM shops WHERE id=$1 AND active=true FOR UPDATE',[shopId])).rows[0];
    if(!shop) throw new DispatchValidationError('Shop is inactive or missing');
    const booking=bookingId===null?null:(await tx.query(
      "SELECT items FROM field_stock_bookings WHERE id=$1 AND shop_id=$2 AND status='PENDING' FOR UPDATE",
      [bookingId,shopId],
    )).rows[0];
    if(bookingId!==null&&!booking)throw new DispatchValidationError('This booking is no longer pending for the selected shop.');
    if(brokerId&&!(await tx.query('SELECT id FROM sales_brokers WHERE id=$1 AND active=true FOR SHARE',[brokerId])).rows[0])throw new DispatchValidationError('Choose an active broker.');
    const outgoing:{batch:any;qty:number;retailC:number;tradeC:number;unitC:number;costC:number;pct:number;lineC:number;basis:DispatchCostBasis;manufacturing:number;box:number;first:number;second:number;companyPrice:number}[]=[];
    let totalC=0, subtotalC=0;
    for(const id of [...grouped.keys()].sort((a,b)=>a-b)) {
      const qty=grouped.get(id)!;
      const result=await tx.query(`SELECT b.*, (b.expiry_date<CURRENT_DATE) AS is_expired,p.retail_price,p.manufacturer_price,p.box_cost,p.name AS product_name
          FROM batches b JOIN products p ON p.id=b.product_id
          WHERE b.id=$1 AND p.active=true FOR UPDATE OF b`,[id]);
      const row=result.rows[0];
      if(!row || Number(row.warehouse_id)!==warehouseId) throw new DispatchValidationError('Selected batch is not in the chosen warehouse');
      if(row.is_expired) throw new DispatchValidationError(`Expired batch cannot be sold: ${row.product_name}`);
      if(Number(row.quantity_on_hand)<qty) throw new DispatchValidationError(`Not enough stock for ${row.product_name} (${row.batch_number}). Available: ${row.quantity_on_hand} units; requested across all rows: ${qty}. Reduce the quantity or receive more stock.`,{batchId:Number(row.id),available:Number(row.quantity_on_hand),requested:qty});
      const retailC=cents(Number(row.retail_price));
      const manufacturing=Number(row.manufacturer_price??row.unit_cost),box=Number(row.box_cost??0);
      const prices=new Map<string,{pct:number;basis:DispatchCostBasis;qty:number;first:number;second:number}>();
      for(const line of lines.filter(line=>line.batchId===id)){
        const basis=line.costBasis,key=[line.firstDiscountPct,line.secondDiscountPct,basis].join(':'),existing=prices.get(key);
        prices.set(key,{pct:line.discountPct,first:line.firstDiscountPct,second:line.secondDiscountPct,basis,qty:(existing?.qty||0)+line.quantity});
      }
      for(const {pct,first,second,basis,qty:lineQty} of prices.values()){
      const costC=cents(dispatchCost(manufacturing,box,basis));
      const {price,companyPrice}=dispatchPricing(Number(row.retail_price),first,second,brokerPct);
      const tradeC=cents(price);
      const unitC=tradeC;
      if (unitC<costC && user.role==='SALES') throw new DispatchValidationError(`Price below batch cost for ${row.product_name}: manager approval required.`);
      const lineC=lineQty*unitC;
      totalC+=lineC;subtotalC+=lineQty*retailC;
      outgoing.push({batch:row,qty:lineQty,retailC,tradeC,unitC,costC,pct,lineC,basis,manufacturing,box,first,second,companyPrice});
      }
    }
    if(booking){
      const dispatched=new Map<number,number>();
      for(const line of outgoing){
        const productId=Number(line.batch.product_id);
        dispatched.set(productId,(dispatched.get(productId)??0)+line.qty);
      }
      const requested=booking.items as {productId:number;quantity:number}[];
      if(requested.length!==dispatched.size||requested.some(line=>dispatched.get(line.productId)!==line.quantity)){
        throw new DispatchValidationError('Dispatch the products and quantities requested in the field booking.');
      }
    }
    const previous=(await tx.query('SELECT COALESCE(SUM(total-paid_total-credit_total),0) AS due FROM invoices WHERE shop_id=$1',[shopId])).rows[0];
    if(Number(shop.credit_limit)>0 && cents(Number(previous.due))+totalC>cents(Number(shop.credit_limit))) throw new DispatchValidationError('Credit limit exceeded. Collect payment or raise approved credit limit.');
    const delivery=(await tx.query(`INSERT INTO deliveries(shop_id,warehouse_id,created_by)
      VALUES($1,$2,$3) RETURNING id`,[shopId,warehouseId,user.id])).rows[0];
    const deliveryId=Number(delivery.id);
    // Serialize public number allocation across shops; internal IDs stay independent.
    await tx.query('SELECT pg_advisory_xact_lock(42190, 1)');
    await tx.query(`WITH next_number AS (
      SELECT (COALESCE(MAX(substring(delivery_no FROM '^DEL-([0-9]+)$')::numeric),0)+1)::text AS number
      FROM deliveries
    )
    UPDATE deliveries SET delivery_no='DEL-'||lpad(number,GREATEST(6,length(number)),'0')
    FROM next_number WHERE id=$1`,[deliveryId]);
    const issueDate=pakistanToday();
    const invoice=(await tx.query(`INSERT INTO invoices(shop_id,delivery_id,issue_date,due_date,subtotal,discount_total,total,note,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[
        shopId,deliveryId,issueDate,invoiceDueDate(issueDate),fromCents(subtotalC),fromCents(subtotalC-totalC),fromCents(totalC),str(form,'note'),user.id])).rows[0];
    createdId=Number(invoice.id);
    if(brokerId)await tx.query('UPDATE invoices SET broker_id=$1,broker_pct=$2 WHERE id=$3',[brokerId,brokerPct,createdId]);
    const invoiceNumber=await nextStoreInvoiceNumber(tx,shopId);
    await tx.query('UPDATE invoices SET invoice_no=$1 WHERE id=$2',[invoiceNumber,createdId]);
    for(const l of outgoing) {
      const b=l.batch;
      await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand-$1 WHERE id=$2',[l.qty,b.id]);
      await tx.query(`INSERT INTO delivery_items(delivery_id,product_id,batch_id,quantity) VALUES($1,$2,$3,$4)`,[deliveryId,b.product_id,b.id,l.qty]);
      await tx.query(`INSERT INTO invoice_items(invoice_id,product_id,batch_id,quantity,retail_unit_price,trade_unit_price,discount_pct,applied_unit_price,unit_cost,line_total,broker_discount_pct,company_unit_price,cost_basis,manufacturing_unit_cost,box_unit_cost,first_discount_pct,second_discount_pct)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[createdId,b.product_id,b.id,l.qty,fromCents(l.retailC),fromCents(l.tradeC),l.pct,fromCents(l.unitC),fromCents(l.costC),fromCents(l.lineC),brokerPct,fromCents(cents(l.companyPrice)),l.basis,l.manufacturing,l.box,l.first,l.second]);
      await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by)
        VALUES($1,$2,$3,'DISPATCH',$4,'DELIVERY',$5,$6,$7)`,[b.id,b.product_id,warehouseId,-l.qty,deliveryId,str(form,'note'),user.id]);
    }
    if(bookingId!==null){
      const {recordFieldAudit}=await import('@/lib/field-sales');
      await tx.query("UPDATE field_stock_bookings SET status='FULFILLED',invoice_id=$2,updated_at=now() WHERE id=$1",[bookingId,createdId]);
      await recordFieldAudit(tx,user,'FIELD_FULFILL_BOOKING','field_booking',bookingId,shopId,form,{invoiceId:createdId,deliveryId});
    }
    await audit(tx,user.id,'CREATE_INVOICE_AND_DISPATCH','invoice',createdId,{deliveryId, total:fromCents(totalC),brokerId,brokerPct,productDiscounts:outgoing.map(l=>({productId:Number(l.batch.product_id),batchId:Number(l.batch.id),shopPercentage:l.pct,firstDiscountPct:l.first,secondDiscountPct:l.second,brokerPercentage:brokerPct,combinedPercentage:l.pct+brokerPct,quantity:l.qty}))});
  });
  done('/invoices/'+createdId);
}
export async function markDelivered(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER','DELIVERY');
  const id=integer(form.get('delivery_id'),'Delivery');
  await transaction(async tx=>{
    const result=await tx.query(`UPDATE deliveries SET status='DELIVERED',recipient_name=$1,tracking_note=$2,delivered_at=NOW() WHERE id=$3 AND status='DISPATCHED' RETURNING id`,[required(form,'recipient_name'),str(form,'tracking_note'),id]);
    if(!result.rows.length) throw new Error('Delivery not found or already confirmed');
    await audit(tx,user.id,'DELIVERED','delivery',id);
  });
  done('/deliveries?delivered='+id);
}
export async function recordPayment(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
  return saveInvoicePayment(form,user,false);
}
export async function recordFieldPayment(form:FormData) {
  const user=await requireRole('SALES','FIELD_SALES','ADMIN','MANAGER');
  return saveInvoicePayment(form,user,true);
}
async function saveInvoicePayment(form:FormData,user:CurrentUser,field:boolean) {
  const paymentDate=validDate(required(form,'payment_date'));
  if(paymentDate>pakistanToday()) throw new Error('Payment received date cannot be in the future.');
  const receipt=await readPaymentReceipt(form);
  const shopId=integer(form.get('shop_id'),'Shop'), amountC=cents(amount(required(form,'amount')));
  if(amountC<=0) throw new Error('Amount must exceed zero');
  const method=required(form,'method');
  if(!['CASH','BANK','EASYPAISA','JAZZCASH','CHEQUE','OTHER'].includes(method)) throw new Error('Invalid payment method');
  const invoiceSelection=str(form,'invoice_id');
  const combined=field&&invoiceSelection==='all';
  const invoiceId=invoiceSelection&&!combined?integer(invoiceSelection,'Invoice'):null;
  if(field&&!combined&&invoiceId===null)throw new Error('Choose one invoice or all open invoices.');
  const submissionId=field?z.uuid().parse(str(form,'submission_id')):null;
  const fieldAccess=field?await import('@/lib/field-sales'):null;
  let paymentId=0;
  await transaction(async tx=>{
    if(fieldAccess){
      await fieldAccess.lockFieldShop(tx,shopId,user);
      const [alreadyRecorded]=(await tx.query(`SELECT id FROM payments
        WHERE field_submission_id=$1 AND shop_id=$2 AND created_by=$3`,[submissionId,shopId,user.id])).rows;
      if(alreadyRecorded){paymentId=Number(alreadyRecorded.id);return;}
    } else {
      const sh=(await tx.query('SELECT id FROM shops WHERE id=$1 FOR UPDATE',[shopId])).rows[0];
      if(!sh) throw new Error('Shop not found');
    }
    const inv=await tx.query(`SELECT id,invoice_no,due_date::text AS due_date,total,paid_total,credit_total FROM invoices WHERE shop_id=$1 AND total>paid_total+credit_total
      ${invoiceId?'AND id=$2':''} ORDER BY due_date,id FOR UPDATE`,invoiceId?[shopId,invoiceId]:[shopId]);
    const totalDue=inv.rows.reduce((sum,r)=>sum+cents(Number(r.total)-Number(r.paid_total)-Number(r.credit_total)),0);
    if(amountC>totalDue) throw new Error('Payment exceeds open invoice balance. Unallocated advances are not supported in this version.');
    const pay=(await tx.query(`INSERT INTO payments(shop_id,amount,method,reference,note,created_by,payment_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [shopId,fromCents(amountC),method,str(form,'reference'),str(form,'note'),user.id,paymentDate])).rows[0];
    paymentId=Number(pay.id);
    if(submissionId)await tx.query('UPDATE payments SET field_submission_id=$1 WHERE id=$2',[submissionId,paymentId]);
    await tx.query('UPDATE payments SET payment_no=$1 WHERE id=$2',[`PAY-${String(paymentId).padStart(6,'0')}`,paymentId]);
    let remaining=amountC;
    const combinedInvoices:FieldCollectionLine[]=[];
    for (const row of inv.rows) {
      const dueC=cents(Number(row.total)-Number(row.paid_total)-Number(row.credit_total));
      const applied=Math.min(remaining,dueC);
      if(combined)combinedInvoices.push({
        invoiceId:String(row.id),
        number:String(row.invoice_no||'Invoice #'+row.id),dueDate:String(row.due_date),
        balanceBeforeCents:dueC,appliedCents:applied,balanceAfterCents:dueC-applied,
      });
      if(applied<=0) continue;
      await tx.query('UPDATE invoices SET paid_total=paid_total+$1 WHERE id=$2',[fromCents(applied),row.id]);
      await tx.query('INSERT INTO payment_allocations(payment_id,invoice_id,amount) VALUES($1,$2,$3)',[paymentId,row.id,fromCents(applied)]);
      remaining-=applied;
      if(remaining===0&&!combined) break;
    }
    if(remaining!==0) throw new Error('Payment allocation failed');
    if(receipt)await savePaymentReceipt(tx,paymentId,receipt,user.id);
    if(fieldAccess) await fieldAccess.recordFieldAudit(tx,user,'FIELD_COLLECT_PAYMENT','payment',paymentId,shopId,form,
      {invoiceId,paymentDate,amount:fromCents(amountC),method,...(combined?{combinedInvoices}:{})});
    else await audit(tx,user.id,'RECORD_PAYMENT','payment',paymentId,{shopId,paymentDate});
  });
  done(field?'/field?shop='+shopId+'&received='+paymentId:'/payments?received='+paymentId);
}
export async function createReturn(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER','WAREHOUSE');
  const itemId=integer(form.get('invoice_item_id'),'Invoice item');
  const qty=integer(form.get('quantity'),'Quantity');
  const reason=required(form,'reason');
  let invoiceId=0;
  await transaction(async tx=>{
    const item=(await tx.query(`SELECT ii.*,i.shop_id,i.total,i.paid_total,i.credit_total,i.id AS parent_invoice_id
       FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ii.id=$1 FOR UPDATE OF i,ii`,[itemId])).rows[0];
    if(!item) throw new Error('Invoice item not found');
    invoiceId=Number(item.parent_invoice_id);
    const returned=(await tx.query('SELECT COALESCE(SUM(quantity),0) AS qty FROM sales_return_items WHERE invoice_item_id=$1',[itemId])).rows[0];
    if(Number(returned.qty)+qty>Number(item.quantity)) throw new Error('Return exceeds originally invoiced quantity');
    const creditC=cents(Number(item.applied_unit_price))*qty;
    const openC=cents(Number(item.total)-Number(item.paid_total)-Number(item.credit_total));
    if(creditC>openC) throw new Error('Return credit exceeds outstanding invoice. A refund/credit-balance workflow is required for paid amounts.');
    const b=(await tx.query('SELECT * FROM batches WHERE id=$1 FOR UPDATE',[item.batch_id])).rows[0];
    if(!b) throw new Error('Original inventory batch not found');
    const ret=(await tx.query(`INSERT INTO sales_returns(invoice_id,shop_id,reason,total_credit,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [invoiceId,item.shop_id,reason,fromCents(creditC),user.id])).rows[0];
    const id=Number(ret.id);
    await tx.query('UPDATE sales_returns SET return_no=$1 WHERE id=$2',[`RET-${String(id).padStart(6,'0')}`,id]);
    await tx.query(`INSERT INTO sales_return_items(return_id,invoice_item_id,quantity,credit_amount) VALUES($1,$2,$3,$4)`,[id,itemId,qty,fromCents(creditC)]);
    await tx.query('UPDATE invoices SET credit_total=credit_total+$1 WHERE id=$2',[fromCents(creditC),invoiceId]);
    await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand+$1 WHERE id=$2',[qty,b.id]);
    await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by)
      VALUES($1,$2,$3,'RETURN',$4,'SALES_RETURN',$5,$6,$7)`,[b.id,b.product_id,b.warehouse_id,qty,id,reason,user.id]);
    await audit(tx,user.id,'SALE_RETURN','invoice',invoiceId,{returnId:id,qty});
  });
  done('/invoices/'+invoiceId+'?returned=1');
}
export async function createExpense(form:FormData) {
  const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
  const value=amount(required(form,'amount'));
  await transaction(async tx=>{const e=(await tx.query(`INSERT INTO expenses(title,category,amount,expense_date,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[required(form,'title'),required(form,'category'),value,dateISO(required(form,'expense_date')),str(form,'note'),user.id])).rows[0];await audit(tx,user.id,'CREATE','expense',Number(e.id));});
  done('/expenses?created=1');
}
export async function createUser(form:FormData) {
  const user=await requireRole('ADMIN');
  const email=required(form,'email').toLowerCase(), password=required(form,'password');
  if(password.length<12) throw new Error('Password must have at least 12 characters');
  const role=roleSchema.parse(required(form,'role'));
  const hash=await bcrypt.hash(password,12);
  const result=await transaction(async tx=>{
    const row=(await tx.query('INSERT INTO users(full_name,email,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id',[
      required(form,'full_name'),email,hash,role])).rows[0];
    if(!row){
      const existing=(await tx.query('SELECT id FROM users WHERE email=$1',[email])).rows[0];
      return {duplicate:true,existingId:existing?.id};
    }
    if(role==='SALES')await tx.query('INSERT INTO sales_agents(user_id) VALUES($1)',[row.id]);
    await audit(tx,user.id,'CREATE_USER','user',Number(row.id));
    return {duplicate:false,existingId:undefined};
  });
  if(result.duplicate)redirect('/staff?error=email-exists'+(result.existingId?'&existing='+encodeURIComponent(result.existingId):''));
  done('/staff?created=1');
}
