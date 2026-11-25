import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {NewDistributionForm} from '@/components/NewDistributionForm';
import Link from 'next/link';
import {notFound} from 'next/navigation';
export default async function NewSale({searchParams}:{searchParams:Promise<{shop?:string;booking?:string}>}){await requireRole('ADMIN','MANAGER');
 const selection=await searchParams;
 const bookingId=selection.booking===undefined?null:Number(selection.booking);
 if(bookingId!==null&&(!Number.isSafeInteger(bookingId)||bookingId<1))notFound();
 const booking=bookingId===null?null:(await query(`SELECT b.id,b.shop_id,b.note,
   (SELECT string_agg(p.name||' × '||(item->>'quantity'),', ' ORDER BY p.name)
    FROM jsonb_array_elements(b.items) item JOIN products p ON p.id=(item->>'productId')::bigint) AS products
   FROM field_stock_bookings b JOIN shops s ON s.id=b.shop_id
   WHERE b.id=$1 AND b.status='PENDING' AND s.active`,[bookingId]))[0];
 if(bookingId!==null&&!booking)notFound();
 const [ss,ww,bb,br]=await Promise.all([
 query('SELECT id,shop_name,credit_limit FROM shops WHERE active=true ORDER BY shop_name'),
 query('SELECT id,name FROM warehouses WHERE active=true ORDER BY name'),
 query(`SELECT b.id,b.warehouse_id,b.product_id,b.quantity_on_hand,b.batch_number,b.expiry_date,p.name AS product_name,p.sku,p.retail_price,p.manufacturer_price,p.box_cost,b.unit_cost FROM batches b JOIN products p ON p.id=b.product_id WHERE b.quantity_on_hand>0 AND p.active=true ORDER BY p.name,b.expiry_date NULLS LAST`),query('SELECT id,full_name FROM sales_brokers WHERE active=true ORDER BY full_name')]);
 const shops=ss.filter(s=>!booking||String(s.id)===String(booking.shop_id)).map(s=>({shop_name:String(s.shop_name),id:Number(s.id),credit_limit:Number(s.credit_limit)}));
 const initialShopId=typeof selection.shop==='string'&&shops.some(s=>String(s.id)===selection.shop)?Number(selection.shop):undefined;
 const warehouses=ww.map(w=>({name:String(w.name),id:Number(w.id)}));
 const batches=bb.map(b=>({batch_number:String(b.batch_number),product_name:String(b.product_name),sku:String(b.sku),id:Number(b.id),warehouse_id:Number(b.warehouse_id),product_id:Number(b.product_id),quantity_on_hand:Number(b.quantity_on_hand),retail_price:Number(b.retail_price),manufacturing_cost:Number(b.manufacturer_price),box_cost:Number(b.box_cost),unit_cost:Number(b.unit_cost),expiry_date:b.expiry_date?new Date(b.expiry_date).toISOString().slice(0,10):null}));
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">OPERATIONS / DISTRIBUTION</span><h1>New Shop Delivery</h1><p>Choose products, set a separate discount percentage for each, and dispatch stock.</p></div><div className="actions"><Link href="/deliveries" className="btn">Delivery History</Link></div></div>{booking && <p className="notice">Field booking #{booking.id} · {booking.products}{booking.note ? " · "+booking.note : ""}</p>}{!shops.length?<div className="notice">Register at least one shop first. <Link href="/shops"><b>Open Shop Directory →</b></Link></div>:<NewDistributionForm brokers={br.map(b=>({id:Number(b.id),name:String(b.full_name)}))} key={booking ? "booking-"+booking.id : initialShopId||0} bookingId={bookingId??undefined} initialShopId={initialShopId} shops={shops} warehouses={warehouses} batches={batches}/>}</>;
}
