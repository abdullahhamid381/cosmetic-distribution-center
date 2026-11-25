import Link from 'next/link';
import {requireAgent} from '@/lib/agent-portal';
import {query} from '@/lib/db';
import {CustomerOrderForm} from '@/components/CustomerOrderForm';
export default async function NewAgentOrder(){
 await requireAgent();
 const products=await query(`SELECT p.id,p.name,p.sku,p.retail_price FROM products p WHERE p.active AND EXISTS(SELECT 1 FROM batches b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=p.id AND b.quantity_on_hand>0 AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE)) ORDER BY p.name,p.id`);
 const brokers=await query('SELECT id,full_name FROM sales_brokers WHERE active=true ORDER BY full_name');
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">MY PORTAL / ADD ORDER</span><h1>Add customer order</h1><p>Enter your customer’s details, products, quantities and payment arrangement.</p></div><Link className="btn" href="/agent/orders">My orders</Link></div><div className="card">{products.length?<CustomerOrderForm brokers={brokers.map(b=>({id:String(b.id),name:b.full_name}))} agentMode agents={[]} batches={products.map(p=>({id:String(p.id),label:`${p.name} (${p.sku})`,price:Number(p.retail_price)}))}/>:<p className="notice">No products are currently available for ordering. Contact your manager.</p>}</div></>;
}
