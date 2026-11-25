import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {CustomerOrderForm} from '@/components/CustomerOrderForm';
export default async function NewCustomerOrder(){
 const user=await requireRole('ADMIN','MANAGER','SALES');if(user.role==='SALES')redirect('/agent/new');
 const [agents,batches,brokers]=await Promise.all([
 query(`SELECT a.id,u.full_name AS name FROM sales_agents a JOIN users u ON u.id=a.user_id WHERE a.active AND u.active AND u.role='SALES' ORDER BY u.full_name`),
 query(`SELECT b.id,p.name,p.sku,p.retail_price,b.batch_number,b.quantity_on_hand,w.name AS warehouse FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE) ORDER BY p.name,b.id`),query('SELECT id,full_name FROM sales_brokers WHERE active=true ORDER BY full_name')
 ]);
 return <><div className="page-title-row"><div className="page-title"><h1>New customer order</h1><p>Your manager will review the details and dispatch the order.</p></div><Link className="btn" href="/sales-team/orders">Back to orders</Link></div><div className="card">{!agents.length&&<p className="notice">A manager must enable your sales agent profile under Agents & targets first.</p>}<CustomerOrderForm brokers={brokers.map(b=>({id:String(b.id),name:b.full_name}))} agents={agents.map(a=>({id:String(a.id),name:a.name}))} batches={batches.map(b=>({id:String(b.id),label:`${b.name} (${b.sku}) / ${b.batch_number} / ${b.warehouse} / stock ${b.quantity_on_hand}`,price:Number(b.retail_price)}))}/></div></>;
}
