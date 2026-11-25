import Link from 'next/link';
import {LocalSaleForm} from '@/components/LocalSaleForm';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {customerOrders} from '@/lib/sales-team-data';
import {orderFinancials,paymentBalance} from '@/lib/sales-team';
import {formatDate,money} from '@/lib/utils';

export default async function LocalSalesPage({searchParams}:{searchParams:Promise<{payment?:string}>}){
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const canRecord=user.role!=='ACCOUNTS';
 const [sales,batches]=await Promise.all([
  customerOrders(null,null,true),
  canRecord?query(`SELECT b.id,b.batch_number,b.quantity_on_hand,p.name,p.retail_price,w.name AS warehouse
   FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id
   WHERE p.active AND w.active AND b.quantity_on_hand>0 AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE)
   ORDER BY p.name,w.name,b.id`):Promise.resolve([]),
 ]);
 const pendingOnly=(await searchParams).payment==='pending';
 const entries=sales.map(sale=>({sale,balance:paymentBalance(sale),profit:orderFinancials({...sale,shipping_charge:0}).profit}));
 const pending=entries.filter(({balance})=>balance.due>0);
 const pendingAmount=pending.reduce((sum,{balance})=>sum+balance.due,0);
 const visible=pendingOnly?pending:entries;
 return <>
  <div className="page-title"><h1>Local Customer Sales</h1><p>Record counter sales and view customer payments.</p></div>
  {canRecord&&<section className="card section-gap"><h2>Record a sale</h2>{batches.length
   ?<LocalSaleForm batches={batches.map(batch=>({id:String(batch.id),label:`${batch.name} · ${batch.batch_number} · ${batch.warehouse} · ${batch.quantity_on_hand} available · ${money(batch.retail_price)}`,price:Number(batch.retail_price),stock:Number(batch.quantity_on_hand)}))}/>
   :<p className="notice">There are no non-expired product batches in stock.</p>}</section>}
  <section id="local-sale-history" className="card section-gap">
   <div className="card-header"><div><h2>Local sale history</h2><p className="card-sub">{pending.length} pending payments · {money(pendingAmount)} due</p></div><div className="actions">
    <Link className={pendingOnly?'btn':'btn primary'} href="/local-sales#local-sale-history" aria-current={pendingOnly?undefined:'page'}>All sales</Link>
    <Link className={pendingOnly?'btn primary':'btn'} href="/local-sales?payment=pending#local-sale-history" aria-current={pendingOnly?'page':undefined}>Pending payments</Link>
   </div></div>
   {visible.length
    ?<div className="table-wrap"><table><thead><tr><th>Sale</th><th>Date</th><th>Customer</th><th>Status</th><th>Total</th><th>Collected</th><th>Due</th><th>Refund due</th><th className="align-right">Profit / Loss</th></tr></thead><tbody>{visible.map(({sale,balance,profit})=>
     <tr key={sale.id}><td><Link href={`/sales-team/${sale.id}`}>CO-{sale.id}</Link>{canRecord&&sale.status==='DELIVERED'&&<div><Link href={`/local-sales/${sale.id}/edit`}>Edit invoice</Link></div>}</td><td>{formatDate(sale.created_date)}</td><td>{sale.customer_name}</td><td>{sale.status}</td><td>{money(sale.retail_total)}</td><td>{money(balance.collected)}</td><td>{money(balance.due)}{balance.due>0&&<div><Link href={`/sales-team/${sale.id}#customer-account`}>Record payment</Link></div>}</td><td>{money(balance.refundDue)}</td><td className={`align-right ${profit<0?"money-negative":profit>0?"money-positive":""}`}>{money(profit)}</td></tr>
    )}</tbody></table></div>:<p className="empty">{pendingOnly?'No local customer payments are pending.':'No local sales recorded yet.'}</p>}
  </section>
 </>;
}
