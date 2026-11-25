'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import bcrypt from 'bcryptjs';
import type {PoolClient} from 'pg';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {records} from '@/lib/records';
import {integer,required,str,dateISO,amount} from '@/lib/utils';
import {readPaymentReceipt,savePaymentReceipt} from '@/lib/payment-receipts';
import {nextStoreInvoiceNumber} from '@/lib/store-invoice-number';

const archivedEntities=['products','shops','warehouses','staff'];

async function moveToTrash(tx:PoolClient,entity:string,id:number,uid:number,table:string,relatedSql="'{}'::jsonb") {
 await tx.query(`INSERT INTO record_trash(entity,record_id,deleted_by,snapshot)
  SELECT $1,r.id,$3,jsonb_build_object('record',to_jsonb(r)-'password_hash') || (${relatedSql})
  FROM ${table} r WHERE r.id=$2`,[entity,id,uid]);
}

function context(form:FormData) {
 const entity=required(form,'entity');
 if(!Object.hasOwn(records,entity))throw new Error('Invalid record type');
 return {entity,config:records[entity],id:integer(form.get('id'),'Record')};
}
async function audit(tx:PoolClient,uid:number,action:string,entity:string,id:number,details:unknown) {
 await tx.query('INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',[uid,action,entity,id,JSON.stringify(details)]);
}
function recordErrorMessage(error:unknown) {
 const code=(error as {code?:string})?.code;
 return code==='23505'?'This reference is already in use. Choose a unique value.':code==='23503'?'This record is linked to other records. Remove those links first.':code?'The change could not be saved. Check the values and linked records.':error instanceof Error?error.message:'Unable to update record.';
}
function failure(entity:string,id:number,error:unknown):never {
 redirect(`/manage/${entity}/${id}?error=${encodeURIComponent(recordErrorMessage(error))}`);
}
export async function saveRecord(form:FormData) {
 const {entity,config,id}=context(form),user=await requireRole(...config.roles);
 try {
  const receipt=entity==='payments'?await readPaymentReceipt(form):null;
  const values:Record<string,unknown>={};
  for(const f of config.fields) {
   const raw=str(form,f.name);
   if(f.type==='password') {if(raw){if(raw.length<12)throw new Error('Password must have at least 12 characters');values.password_hash=await bcrypt.hash(raw,12);}continue;}
   if(f.required&&!raw)throw new Error(`${f.label} is required`);
   if(f.options&&!f.options.includes(raw))throw new Error(`Invalid ${f.label}`);
   if(f.type==='checkbox')values[f.name]=form.has(f.name);
   else if(f.type==='number') {
    if(raw===''){values[f.name]=null;continue;}
    const n=Number(raw);
    if(!Number.isFinite(n)||(f.min!==undefined&&n<f.min)||(f.max!==undefined&&n>f.max)||(!f.step&&!Number.isSafeInteger(n)))throw new Error(`Invalid ${f.label}`);
    values[f.name]=f.step?amount(raw):n;
   } else if(f.type==='date')values[f.name]=raw?dateISO(raw):null;
   else values[f.name]=raw;
  }
  if(entity==='products') {
   values.sku=String(values.sku).toUpperCase();
   values.landed_cost=(Math.round(Number(values.manufacturer_price)*100)+Math.round(Number(values.box_cost)*100))/100;
  }
  if(entity==='batches'&&values.manufacture_date&&values.expiry_date&&String(values.manufacture_date)>=String(values.expiry_date))throw new Error('Expiry date must follow manufacturing date');
  if(entity==='staff') {
   values.email=String(values.email).toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email)))throw new Error('Enter a valid email');
   if(user.id===id&&(!values.active||values.role!=='ADMIN'))throw new Error('You cannot disable or demote your own account');
  }
  await transaction(async tx=>{
   const before=(await tx.query(`SELECT * FROM ${config.table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
   if(!before)throw new Error('Record not found');
   if((await tx.query('SELECT 1 FROM record_trash WHERE entity=$1 AND record_id=$2',[entity,id])).rowCount)
    throw new Error('Restore this record from Trash before editing it.');
   if(entity==='warehouses'&&!values.active) {
    const stock=(await tx.query('SELECT id FROM batches WHERE warehouse_id=$1 AND quantity_on_hand>0 FOR UPDATE',[id])).rows;
    if(stock.length)throw new Error('Move or adjust all warehouse stock before disabling it');
   }
   const keys=Object.keys(values);
   if(receipt)await savePaymentReceipt(tx,id,receipt,user.id);
   await tx.query(`UPDATE ${config.table} SET ${keys.map((key,i)=>`${key}=$${i+1}`).join(',')} WHERE id=$${keys.length+1}`,[...Object.values(values),id]);
   if(entity==='staff'&&values.role==='SALES')await tx.query('INSERT INTO sales_agents(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[id]);
   if(entity==='deliveries')await tx.query("UPDATE deliveries SET delivered_at=CASE WHEN status='DELIVERED' THEN COALESCE(delivered_at,NOW()) ELSE NULL END WHERE id=$1",[id]);
   if(entity==='shops'&&String(before.default_discount??'')!==String(values.default_discount??''))await tx.query('INSERT INTO price_audit(shop_id,old_pct,new_pct,changed_by) VALUES($1,$2,$3,$4)',[id,before.default_discount,values.default_discount,user.id]);
   delete before.password_hash;
   const changes={...values};delete changes.password_hash;
   await audit(tx,user.id,'UPDATE',entity,id,{before,changes,passwordChanged:!!values.password_hash,receiptUpdated:!!receipt});
  });
 } catch(error){failure(entity,id,error);}
 revalidatePath('/','layout');redirect(config.path);
}

async function cancelInvoice(tx:PoolClient,invoiceId:number,uid:number) {
 const invoice=(await tx.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE',[invoiceId])).rows[0];
 if(!invoice)throw new Error('Invoice not found');
 const linked=(await tx.query('SELECT id FROM payment_allocations WHERE invoice_id=$1 UNION ALL SELECT id FROM sales_returns WHERE invoice_id=$1',[invoiceId])).rows;
 if(linked.length||Number(invoice.paid_total)||Number(invoice.credit_total))throw new Error('Delete allocated payments and reverse returns before deleting this invoice');
 const items=(await tx.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY batch_id',[invoiceId])).rows;
 if(invoice.delivery_id)await tx.query('SELECT id FROM deliveries WHERE id=$1 FOR UPDATE',[invoice.delivery_id]);
 await moveToTrash(tx,'invoices',invoiceId,uid,'invoices',`jsonb_build_object(
  'items',(SELECT COALESCE(jsonb_agg(i),'[]') FROM invoice_items i WHERE i.invoice_id=r.id),
  'delivery',(SELECT to_jsonb(d) FROM deliveries d WHERE d.id=r.delivery_id),
  'deliveryItems',(SELECT COALESCE(jsonb_agg(di),'[]') FROM delivery_items di WHERE di.delivery_id=r.delivery_id))`);
 for(const item of items) {
  const batch=(await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand+$1 WHERE id=$2 RETURNING *',[item.quantity,item.batch_id])).rows[0];
  await tx.query("INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by) VALUES($1,$2,$3,'ADJUSTMENT',$4,'INVOICE_CANCELLATION',$5,$6,$7)",[batch.id,batch.product_id,batch.warehouse_id,item.quantity,invoiceId,`Stock returned after deleting ${invoice.invoice_no||'invoice #'+invoiceId}`,uid]);
 }
 await audit(tx,uid,'DELETE','invoices',invoiceId,{invoice,items,stockRestored:true});
 await tx.query('DELETE FROM invoice_items WHERE invoice_id=$1',[invoiceId]);
 await tx.query('DELETE FROM invoices WHERE id=$1',[invoiceId]);
 if(invoice.delivery_id) {
  await tx.query('DELETE FROM delivery_items WHERE delivery_id=$1',[invoice.delivery_id]);
  await tx.query('DELETE FROM deliveries WHERE id=$1',[invoice.delivery_id]);
 }
}
export async function deleteInvoiceFromList(filters:string,form:FormData) {
 const user=await requireRole(...records.invoices.roles);
 const params=new URLSearchParams(filters);
 params.delete('deleteError');
 params.delete('deleted');
 try {
  const id=integer(form.get('id'),'Invoice');
  await transaction(tx=>cancelInvoice(tx,id,user.id));
 } catch(error) {
  params.set('deleteError',recordErrorMessage(error));
  redirect(`/invoices?${params}`);
 }
 revalidatePath('/','layout');
 params.set('deleted','1');
 redirect(`/invoices?${params}`);
}

export async function deleteRecord(form:FormData) {
 const {entity,config,id}=context(form),user=await requireRole(...config.roles);
 try {
  await transaction(async tx=>{
   if(entity==='invoices') {await cancelInvoice(tx,id,user.id);return;}
   if(entity==='deliveries') {
    const invoice=(await tx.query('SELECT id FROM invoices WHERE delivery_id=$1',[id])).rows[0];
    if(!invoice)throw new Error('This delivery has no invoice. Contact an administrator to reconcile its stock.');
    await cancelInvoice(tx,Number(invoice.id),user.id);return;
   }
   const row=(await tx.query(`SELECT * FROM ${config.table} WHERE id=$1 FOR UPDATE`,[id])).rows[0];
   if(!row)throw new Error('Record not found');
   if(entity==='staff'&&user.id===id)throw new Error('You cannot disable your own account');
   const relatedSql=entity==='payments'?`jsonb_build_object(
    'allocations',(SELECT COALESCE(jsonb_agg(a),'[]') FROM payment_allocations a WHERE a.payment_id=r.id),
    'receipt',(SELECT to_jsonb(p) FROM payment_receipts p WHERE p.payment_id=r.id))`:
    entity==='returns'?`jsonb_build_object('items',
    (SELECT COALESCE(jsonb_agg(to_jsonb(i)||jsonb_build_object('batch_id',ii.batch_id)),'[]')
     FROM sales_return_items i JOIN invoice_items ii ON ii.id=i.invoice_item_id WHERE i.return_id=r.id))`:undefined;
   if((await tx.query('SELECT 1 FROM record_trash WHERE entity=$1 AND record_id=$2',[entity,id])).rowCount)
    throw new Error('This record is already in Trash.');
   await moveToTrash(tx,entity,id,user.id,config.table,relatedSql);
   if(entity==='payments') {
    const allocations=(await tx.query('SELECT * FROM payment_allocations WHERE payment_id=$1 ORDER BY invoice_id',[id])).rows;
    for(const allocation of allocations)await tx.query('UPDATE invoices SET paid_total=paid_total-$1 WHERE id=$2',[allocation.amount,allocation.invoice_id]);
    await tx.query('DELETE FROM payment_allocations WHERE payment_id=$1',[id]);
    await audit(tx,user.id,'REVERSE_ALLOCATIONS',entity,id,{allocations});
   }
   if(entity==='returns') {
    await tx.query('SELECT id FROM invoices WHERE id=$1 FOR UPDATE',[row.invoice_id]);
    const items=(await tx.query('SELECT ri.*,ii.batch_id FROM sales_return_items ri JOIN invoice_items ii ON ii.id=ri.invoice_item_id WHERE ri.return_id=$1 ORDER BY ii.batch_id',[id])).rows;
    for(const item of items) {
     const batch=(await tx.query('UPDATE batches SET quantity_on_hand=quantity_on_hand-$1 WHERE id=$2 AND quantity_on_hand >= $1 RETURNING *',[item.quantity,item.batch_id])).rows[0];
     if(!batch)throw new Error('Not enough stock in the original batch to reverse this return');
     await tx.query("INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by) VALUES($1,$2,$3,'ADJUSTMENT',$4,'RETURN_CANCELLATION',$5,'Sales return reversed',$6)",[batch.id,batch.product_id,batch.warehouse_id,-Number(item.quantity),id,user.id]);
    }
    await tx.query('UPDATE invoices SET credit_total=credit_total-$1 WHERE id=$2',[row.total_credit,row.invoice_id]);
    await tx.query('DELETE FROM sales_return_items WHERE return_id=$1',[id]);
    await audit(tx,user.id,'REVERSE_RETURN',entity,id,{items});
   }
   if(entity==='warehouses') {
    const stock=(await tx.query('SELECT id FROM batches WHERE warehouse_id=$1 AND quantity_on_hand>0 FOR UPDATE',[id])).rows;
    if(stock.length)throw new Error('Move or adjust all warehouse stock before deleting it');
   }
   if(entity==='batches') {
    const qty=Number(row.quantity_on_hand);
    if(!qty)throw new Error('This batch is already empty. Its history is retained.');
    await tx.query('UPDATE batches SET quantity_on_hand=0 WHERE id=$1',[id]);
    await tx.query("INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,note,created_by) VALUES($1,$2,$3,'ADJUSTMENT',$4,'BATCH_REMOVAL','Remaining stock removed by Delete action',$5)",[id,row.product_id,row.warehouse_id,-qty,user.id]);
   } else if(archivedEntities.includes(entity))await tx.query(`UPDATE ${config.table} SET active=false WHERE id=$1`,[id]);
   else await tx.query(`DELETE FROM ${config.table} WHERE id=$1`,[id]);
   delete row.password_hash;
   await audit(tx,user.id,'DELETE',entity,id,{before:row,archived:archivedEntities.includes(entity)});
  });
 } catch(error){failure(entity,id,error);}
 revalidatePath('/','layout');redirect(config.path);
}

async function restoreRows(tx:PoolClient,trashId:number,table:string,key:string,many=false) {
 // The table and snapshot key are supplied only by the server's record configuration.
 const populate=many?'jsonb_populate_recordset':'jsonb_populate_record';
 await tx.query(`INSERT INTO ${table} SELECT r.* FROM record_trash t
  CROSS JOIN LATERAL ${populate}(NULL::${table},NULLIF(t.snapshot->$2,'null'::jsonb)) r
  WHERE t.id=$1 AND jsonb_typeof(t.snapshot->$2)<>'null'`,[trashId,key]);
}

async function restoreStock(tx:PoolClient,batchId:string,delta:number,reference:string,id:string,note:string,uid:number) {
 const [batch]=(await tx.query(`UPDATE batches SET quantity_on_hand=quantity_on_hand+$2
  WHERE id=$1 AND quantity_on_hand+$2>=0 RETURNING *`,[batchId,delta])).rows;
 if(!batch)throw new Error('The original batch is missing or has insufficient stock.');
 await tx.query(`INSERT INTO stock_movements(batch_id,product_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by)
  VALUES($1,$2,$3,'ADJUSTMENT',$4,$5,$6,$7,$8)`,[batch.id,batch.product_id,batch.warehouse_id,delta,reference,id,note,uid]);
}

async function restoreInvoice(tx:PoolClient,trashId:number,uid:number) {
 const [record]=(await tx.query(`SELECT snapshot->'record'->>'id' AS id,
  snapshot->'record'->>'shop_id' AS shop_id,snapshot->'record'->>'invoice_no' AS invoice_no,
  snapshot->'record'->>'total' AS total,snapshot->'delivery'->>'warehouse_id' AS warehouse_id,
  snapshot->'delivery'->>'delivery_no' AS delivery_no FROM record_trash WHERE id=$1`,[trashId])).rows;
 // Lock the destination shop and the owner of the invoice number prefix, if different.
 const shops=(await tx.query(`SELECT id,active,credit_limit FROM shops
  WHERE id=$1 OR starts_with($2,store_code||'-INV-') ORDER BY id FOR UPDATE`,[record.shop_id,record.invoice_no])).rows;
 const shop=shops.find(shop=>String(shop.id)===record.shop_id);
 if(!shop?.active)throw new Error('Restore or enable the shop first.');
 const [credit]=(await tx.query(`SELECT $2::numeric>0 AND
  COALESCE(SUM(total-paid_total-credit_total),0)+$3::numeric>$2::numeric AS exceeded
  FROM invoices WHERE shop_id=$1`,[shop.id,shop.credit_limit,record.total])).rows;
 if(credit.exceeded)throw new Error('Restoring this invoice would exceed the shop credit limit.');
 if(record.warehouse_id&&!(await tx.query('SELECT id FROM warehouses WHERE id=$1 AND active FOR SHARE',[record.warehouse_id])).rowCount)
  throw new Error('Restore or enable the warehouse first.');
 const {rows:items}=await tx.query(`SELECT i.batch_id::text,SUM(i.quantity)::integer AS quantity
  FROM record_trash t CROSS JOIN LATERAL jsonb_populate_recordset(NULL::invoice_items,t.snapshot->'items') i
  WHERE t.id=$1 GROUP BY i.batch_id ORDER BY i.batch_id`,[trashId]);
 const invoiceNo=record.invoice_no&&!(await tx.query('SELECT id FROM invoices WHERE invoice_no=$1',[record.invoice_no])).rowCount
  ?record.invoice_no:await nextStoreInvoiceNumber(tx,Number(shop.id));
 for(const item of items)await restoreStock(tx,item.batch_id,-item.quantity,'INVOICE_RESTORE',record.id,`Stock deducted after restoring ${invoiceNo}`,uid);

 // Use the same numbering lock as dispatch before checking for a reused delivery number.
 await tx.query('SELECT pg_advisory_xact_lock(42190, 1)');
 const deliveryConflict=record.delivery_no&&(await tx.query('SELECT id FROM deliveries WHERE delivery_no=$1',[record.delivery_no])).rowCount;
 await tx.query(`INSERT INTO deliveries SELECT d.* FROM record_trash t
  CROSS JOIN LATERAL jsonb_populate_record(NULL::deliveries,
   CASE WHEN $2 THEN jsonb_set(t.snapshot->'delivery','{delivery_no}',to_jsonb(
    (SELECT 'DEL-'||lpad(n,GREATEST(6,length(n)),'0') FROM
     (SELECT (COALESCE(MAX(substring(delivery_no FROM '^DEL-([0-9]+)$')::numeric),0)+1)::text AS n FROM deliveries) next)))
   ELSE NULLIF(t.snapshot->'delivery','null'::jsonb) END) d
  WHERE t.id=$1 AND jsonb_typeof(t.snapshot->'delivery')='object'`,[trashId,Boolean(deliveryConflict)]);
 await restoreRows(tx,trashId,'delivery_items','deliveryItems',true);
 await tx.query(`INSERT INTO invoices SELECT i.* FROM record_trash t
  CROSS JOIN LATERAL jsonb_populate_record(NULL::invoices,jsonb_set(t.snapshot->'record','{invoice_no}',to_jsonb($2::text))) i
  WHERE t.id=$1`,[trashId,invoiceNo]);
 await restoreRows(tx,trashId,'invoice_items','items',true);
 return invoiceNo;
}

async function restorePayment(tx:PoolClient,trashId:number) {
 const {rows:allocations}=await tx.query(`SELECT a.invoice_id::text,a.amount::text,t.snapshot->'record'->>'shop_id' AS shop_id
  FROM record_trash t CROSS JOIN LATERAL jsonb_populate_recordset(NULL::payment_allocations,t.snapshot->'allocations') a
  WHERE t.id=$1 ORDER BY a.invoice_id`,[trashId]);
 for(const a of allocations) {
  const result=await tx.query(`UPDATE invoices SET paid_total=paid_total+$2 WHERE id=$1 AND shop_id=$3
   AND total-paid_total-credit_total >= $2`,[a.invoice_id,a.amount,a.shop_id]);
  if(!result.rowCount)throw new Error('An original invoice is missing, has changed shops, or no longer has enough unpaid balance.');
 }
 await restoreRows(tx,trashId,'payments','record');
 await restoreRows(tx,trashId,'payment_allocations','allocations',true);
 await restoreRows(tx,trashId,'payment_receipts','receipt');
}

async function restoreReturn(tx:PoolClient,trashId:number,id:string,uid:number) {
 const result=await tx.query(`UPDATE invoices i SET credit_total=i.credit_total+r.total_credit FROM record_trash t
  CROSS JOIN LATERAL jsonb_populate_record(NULL::sales_returns,t.snapshot->'record') r
  WHERE t.id=$1 AND i.id=r.invoice_id AND i.shop_id=r.shop_id AND i.total-i.paid_total-i.credit_total>=r.total_credit`,[trashId]);
 if(!result.rowCount)throw new Error('The original invoice is missing, has changed shops, or no longer has enough balance for this credit.');
 const {rows:items}=await tx.query(`SELECT ii.batch_id::text,i.quantity,ii.id AS item_id,
  ii.quantity-COALESCE((SELECT SUM(quantity) FROM sales_return_items WHERE invoice_item_id=ii.id),0) AS returnable
  FROM record_trash t CROSS JOIN LATERAL jsonb_populate_recordset(NULL::sales_return_items,t.snapshot->'items') i
  LEFT JOIN invoice_items ii ON ii.id=i.invoice_item_id WHERE t.id=$1 ORDER BY ii.batch_id`,[trashId]);
 for(const item of items) {
  if(!item.item_id||item.quantity>Number(item.returnable))throw new Error('The original invoice line is missing or has too few returnable units.');
  await restoreStock(tx,item.batch_id,item.quantity,'RETURN_RESTORE',id,'Stock added after restoring sales return',uid);
 }
 await restoreRows(tx,trashId,'sales_returns','record');
 await restoreRows(tx,trashId,'sales_return_items','items',true);
}

export async function restoreRecord(form:FormData) {
 const entity=required(form,'entity'),trashId=integer(form.get('id'),'Trash entry');
 if(!Object.hasOwn(records,entity))throw new Error('Invalid record type');
 const config=records[entity],user=await requireRole(...config.roles);
 let message='Record restored.';
 try {
  await transaction(async tx=>{
   const [entry]=(await tx.query(`SELECT record_id,snapshot->'record'->>'quantity_on_hand' AS quantity,
    (snapshot->'record'->>'active')::boolean AS was_active
    FROM record_trash WHERE id=$1 AND entity=$2 FOR UPDATE`,[trashId,entity])).rows;
   if(!entry)throw new Error('This record is no longer in Trash.');
   if(entity==='invoices')message=`Invoice restored as ${await restoreInvoice(tx,trashId,user.id)}.`;
   else if(entity==='payments')await restorePayment(tx,trashId);
   else if(entity==='returns')await restoreReturn(tx,trashId,entry.record_id,user.id);
   else if(entity==='batches')await restoreStock(tx,entry.record_id,Number(entry.quantity),'BATCH_RESTORE',entry.record_id,'Stock added after restoring batch removal',user.id);
   else if(archivedEntities.includes(entity)) {
    const result=await tx.query(`UPDATE ${config.table} SET active=$2 WHERE id=$1`,[entry.record_id,entry.was_active]);
    if(!result.rowCount)throw new Error('The original record is missing.');
   } else await restoreRows(tx,trashId,config.table,'record');
   await audit(tx,user.id,'RESTORE',entity,entry.record_id,{trashId,message});
   await tx.query('DELETE FROM record_trash WHERE id=$1',[trashId]);
  });
 } catch(error) {
  const code=(error as {code?:string})?.code;
  const detail=code==='23505'?'A reference from this record is in use.':code==='23503'?'Restore the linked records first.':
   code?'The record could not be restored against the current data.':error instanceof Error?error.message:'Unable to restore record.';
  redirect(`/trash?error=${encodeURIComponent(detail)}`);
 }
 revalidatePath('/','layout');
 redirect(`/trash?restored=${encodeURIComponent(message)}`);
}
