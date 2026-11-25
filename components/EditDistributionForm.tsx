import {query} from '@/lib/db';
import {notFound} from 'next/navigation';
import {NewDistributionForm} from './NewDistributionForm';

export async function EditDistributionForm({id}:{id:string}){
 const invoice=(await query(`SELECT i.*,d.warehouse_id FROM invoices i JOIN deliveries d ON d.id=i.delivery_id WHERE i.id=$1`,[id]))[0];
 if(!invoice)notFound();
 const [items,shops,warehouses,batches,brokers]=await Promise.all([
  query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id',[id]),
  query('SELECT id,shop_name,credit_limit FROM shops WHERE active=true OR id=$1 ORDER BY shop_name',[invoice.shop_id]),
  query('SELECT id,name FROM warehouses WHERE active=true OR id=$1 ORDER BY name',[invoice.warehouse_id]),
  query(`SELECT b.*,p.name AS product_name,p.sku,p.retail_price,p.manufacturer_price,p.box_cost,COALESCE(own.qty,0) AS dispatched FROM batches b JOIN products p ON p.id=b.product_id LEFT JOIN (SELECT batch_id,SUM(quantity) AS qty FROM invoice_items WHERE invoice_id=$1 GROUP BY batch_id) own ON own.batch_id=b.id WHERE (b.quantity_on_hand>0 AND p.active=true) OR own.qty>0 ORDER BY p.name,b.id`,[id]),
  query('SELECT id,full_name FROM sales_brokers WHERE active=true OR id=$1 ORDER BY full_name',[invoice.broker_id])
 ]);
 return <NewDistributionForm initialShopId={Number(invoice.shop_id)} shops={shops.map(s=>({id:Number(s.id),shop_name:String(s.shop_name),credit_limit:Number(s.credit_limit)}))} warehouses={warehouses.map(w=>({id:Number(w.id),name:String(w.name)}))} batches={batches.map(b=>({id:Number(b.id),warehouse_id:Number(b.warehouse_id),product_id:Number(b.product_id),quantity_on_hand:Number(b.quantity_on_hand)+Number(b.dispatched),batch_number:String(b.batch_number),product_name:String(b.product_name),sku:String(b.sku),retail_price:Number(b.retail_price),manufacturing_cost:Number(b.manufacturer_price),box_cost:Number(b.box_cost),unit_cost:Number(b.unit_cost),expiry_date:b.expiry_date?new Date(b.expiry_date).toISOString().slice(0,10):null}))} brokers={brokers.map(b=>({id:Number(b.id),name:String(b.full_name)}))} edit={{id:Number(id),warehouseId:Number(invoice.warehouse_id),brokerId:invoice.broker_id?String(invoice.broker_id):'',brokerPct:String(invoice.broker_pct),note:String(invoice.note??''),originalLines:JSON.stringify(items),lines:items.map((l,index)=>({id:index+1,itemId:Number(l.id),batchId:Number(l.batch_id),originalBatchId:Number(l.batch_id),retail:Number(l.retail_unit_price),costBasis:l.cost_basis,manufacturingCost:l.manufacturing_unit_cost===null?undefined:Number(l.manufacturing_unit_cost),boxCost:l.box_unit_cost===null?undefined:Number(l.box_unit_cost),legacyCost:Number(l.unit_cost),quantity:Number(l.quantity),percentage:String(l.first_discount_pct??l.discount_pct),secondPercentage:String(l.second_discount_pct??0)}))}}/>;
}
