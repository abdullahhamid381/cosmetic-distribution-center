import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {money} from '@/lib/utils';

export default async function StockMovementDetail({params}:{params:Promise<{id:string}>}) {
 const user=await requireRole('ADMIN','MANAGER','WAREHOUSE');
 const {id}=await params;
 if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)notFound();
 const [movement]=await query(`SELECT m.*,p.name AS product_name,p.sku,p.brand,b.batch_number,
   to_char(b.manufacture_date,'YYYY-MM-DD') AS manufacture_date,
   to_char(b.expiry_date,'YYYY-MM-DD') AS expiry_date,b.unit_cost,b.quantity_on_hand,
   w.name AS warehouse_name,w.location,u.full_name AS staff,
   d.delivery_no,d.status AS delivery_status,s.shop_name,
   i.id AS invoice_id,i.invoice_no,r.return_no,ri.id AS return_invoice_id,ri.invoice_no AS return_invoice_no,
   sw.name AS source_warehouse,dw.name AS destination_warehouse,t.note AS transfer_note
   FROM stock_movements m
   JOIN products p ON p.id=m.product_id JOIN batches b ON b.id=m.batch_id
   JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN users u ON u.id=m.created_by
   LEFT JOIN deliveries d ON m.reference_type='DELIVERY' AND d.id=m.reference_id
   LEFT JOIN shops s ON s.id=d.shop_id LEFT JOIN invoices i ON i.delivery_id=d.id
   LEFT JOIN sales_returns r ON m.reference_type='SALES_RETURN' AND r.id=m.reference_id
   LEFT JOIN invoices ri ON ri.id=r.invoice_id
   LEFT JOIN stock_transfers t ON m.reference_type='TRANSFER' AND t.id=m.reference_id
   LEFT JOIN batches sb ON sb.id=t.source_batch_id LEFT JOIN warehouses sw ON sw.id=sb.warehouse_id
   LEFT JOIN batches db ON db.id=t.destination_batch_id LEFT JOIN warehouses dw ON dw.id=db.warehouse_id
   WHERE m.id=$1`,[id]);
 if(!movement)notFound();
 const qty=Number(movement.quantity_delta),canOpenInvoice=['ADMIN','MANAGER'].includes(user.role);
 const invoiceId=movement.invoice_id||movement.return_invoice_id;
 const fields=[
  ['Product',movement.product_name],['SKU',movement.sku],['Brand',movement.brand],
  ['Batch',movement.batch_number],['Warehouse',movement.warehouse_name],['Location',movement.location],
  ['Manufacturing date',movement.manufacture_date],['Expiry date',movement.expiry_date],
  ['Batch unit cost',money(movement.unit_cost)],['Current batch stock',`${movement.quantity_on_hand} units`],
  ['Recorded by',movement.staff||'System'],['Reference type',movement.reference_type],
  ['Reference ID',movement.reference_id],['Delivery',movement.delivery_no],['Delivery status',movement.delivery_status],
  ['Shop',movement.shop_name],['Return',movement.return_no],['Source warehouse',movement.source_warehouse],
  ['Destination warehouse',movement.destination_warehouse],
 ];
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">INVENTORY / STOCK MOVEMENT</span><h1>{movement.movement_type} #{movement.id}</h1><p>{movement.product_name} · {new Date(movement.created_at).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})} (Pakistan time)</p></div><Link href="/inventory#stock-movements" className="btn">Back to inventory</Link></div>
 <div className="stats-grid"><div className="card stat"><div className="stat-top">Quantity change</div><strong className={qty>=0?'money-positive':'money-negative'}>{qty>0?'+':''}{qty} units</strong></div><div className="card stat"><div className="stat-top">Movement type</div><strong>{movement.movement_type}</strong></div></div>
 <div className="card"><h2>Movement details</h2><div className="form-grid section-gap">{fields.filter(([,value])=>value!==null&&value!==undefined&&value!=='').map(([label,value])=><div className="field" key={label}><label>{label}</label><div>{value}</div></div>)}</div>
 <div className="section-gap"><h2>Note</h2><p style={{whiteSpace:'pre-wrap'}}>{movement.note||movement.transfer_note||'No note recorded.'}</p></div>
 {invoiceId&&<div className="section-gap">{canOpenInvoice?<Link className="btn primary" href={`/invoices/${invoiceId}`}>Open invoice {movement.invoice_no||movement.return_invoice_no}</Link>:<p>Invoice: {movement.invoice_no||movement.return_invoice_no}</p>}</div>}
 </div></>;
}
