import Link from 'next/link';
import {notFound} from 'next/navigation';
import {LocalSaleForm} from '@/components/LocalSaleForm';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {money} from '@/lib/utils';

export default async function EditLocalSalePage({params}:{params:Promise<{id:string}>}){
 await requireRole('ADMIN','MANAGER');
 const {id}=await params;
 if(!/^\d+$/.test(id))notFound();
 const [order]=await query(`SELECT o.*,o.updated_at::text AS version,
  COALESCE((SELECT SUM(CASE WHEN kind='COLLECTION' THEN amount ELSE -amount END) FROM customer_order_payments WHERE order_id=o.id),0) AS collected
  FROM customer_orders o WHERE o.id=$1 AND o.agent_id IS NULL`,[id]);
 if(!order)notFound();
 const back='/sales-team/'+id;
 if(order.status!=='DELIVERED')return <div className="card"><h1>Local invoice CO-{id}</h1><p>Only completed local sales that have not been returned can be edited.</p><Link className="btn" href={back}>Back to invoice</Link></div>;
 const batches=await query(`SELECT b.id,b.batch_number,p.name,w.name AS warehouse,
  COALESCE(ci.original_retail_price,ci.retail_price,p.retail_price) AS retail,
  ci.quantity,ci.first_discount_pct,ci.second_discount_pct,
  COALESCE(ci.quantity,0)+CASE WHEN availability.active THEN b.quantity_on_hand ELSE 0 END AS editable_stock
  FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id
  LEFT JOIN customer_order_items ci ON ci.order_id=$1 AND ci.batch_id=b.id
  CROSS JOIN LATERAL(SELECT p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE) AS active) availability
  WHERE ci.id IS NOT NULL OR (availability.active AND b.quantity_on_hand>0) ORDER BY p.name,w.name,b.id`,[id]);
 const rows=batches.filter(batch=>batch.quantity!=null).map((batch,index)=>({id:index+1,batchId:String(batch.id),quantity:String(batch.quantity),first:String(batch.first_discount_pct??0),second:String(batch.second_discount_pct??0)}));
 return <>
  <div className="page-title-row"><div className="page-title"><h1>Edit local invoice CO-{id}</h1></div><Link className="btn" href={back}>Back to invoice</Link></div>
  <section className="card">
   <LocalSaleForm batches={batches.map(batch=>({id:String(batch.id),label:`${batch.name} · ${batch.batch_number} · ${batch.warehouse} · ${batch.editable_stock} available for this invoice · ${money(batch.retail)}`,price:Number(batch.retail),stock:Number(batch.editable_stock)}))}
    edit={{id,version:order.version,rows,collected:Number(order.collected),shipping:Number(order.shipping_charge),customer:{
     customer_name:order.customer_name,phone:order.phone,alternate_phone:order.alternate_phone,email:order.email,address:order.address,city:order.city,note:order.requirements,
    }}}/>
  </section>
 </>;
}
