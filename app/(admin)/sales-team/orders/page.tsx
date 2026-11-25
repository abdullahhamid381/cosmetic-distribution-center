import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {customerOrders,departmentAgents} from '@/lib/sales-team-data';
import {orderFinancials,paymentBalance} from '@/lib/sales-team';
import {filterDepartmentOrders,departmentTotals,DepartmentFilters} from '@/lib/sales-department';
import {money,formatDate} from '@/lib/utils';
import {DepartmentOrderFilters} from '@/components/DepartmentOrderFilters';
import {DepartmentStats} from '@/components/DepartmentStats';
export default async function Orders({searchParams}:{searchParams:Promise<DepartmentFilters>}){
 const user=await requireRole('ADMIN','MANAGER','SALES','ACCOUNTS'),scoped=user.role==='SALES'?user.id:null,filters=await searchParams;
 const [all,agents]=await Promise.all([customerOrders(scoped),departmentAgents(scoped)]);
 let orders:typeof all;try{orders=filterDepartmentOrders(all,filters);}catch{return <p className="notice">Invalid date range. <Link href="/sales-team/orders">Reset order filters</Link></p>;}
 const totals=departmentTotals(orders);
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">SALES DEPARTMENT / ORDER DESK</span><h1>Customer orders</h1><p>Review customer requirements, process shipments and track payment balances.</p></div>{user.role!=='ACCOUNTS'&&<Link className="btn primary" href="/sales-team/new">+ New customer order</Link>}</div>
 <DepartmentStats items={[["Orders",orders.length],["Delivered retail",money(totals.retail)],["Customer amount due",money(totals.due)],["Refunds due",money(totals.refundDue)]]}/>
 <DepartmentOrderFilters filters={filters} agents={agents.map(a=>({id:String(a.id),name:a.full_name}))}/>
 <div className="card section-gap"><div className="table-wrap"><table><thead><tr><th>Order / priority</th><th>Customer</th><th>Agent</th><th>Status</th><th>Retail / shipping</th><th>Payment balance</th><th>Courier / tracking</th><th>Net profit</th></tr></thead><tbody>{orders.map(o=>{const f=orderFinancials(o),p=paymentBalance(o);return <tr key={o.id}><td><Link className="table-name" href={'/sales-team/'+o.id}>CO-{o.id}</Link><br/>{formatDate(o.created_at)}{o.priority!=='NORMAL'&&<p className="overdue">{o.priority}</p>}</td><td>{o.customer_name}<br/>{o.phone}<br/>{o.city}</td><td><Link href={'/sales-team/agents/'+o.agent_id}>{o.agent_name}</Link></td><td><span className={'badge '+(o.status==='PENDING'?'pending':['CANCELLED','RETURNED'].includes(o.status)?'red':'blue')}>{o.status}</span></td><td>{money(o.retail_total)}<br/>Shipping: {money(o.shipping_charge)}</td><td>{p.refundDue>0?<span className="overdue">Refund {money(p.refundDue)}</span>:p.due>0?'Due '+money(p.due):'Settled'}<br/>Collected: {money(p.collected)}{Number(o.pending_advance)>0&&<p className="overdue">Verify advance {money(o.pending_advance)}</p>}</td><td>{o.courier_name||'Awaiting dispatch'}<br/>{o.tracking_number||'—'}{o.expected_delivery&&<p>Expected {formatDate(o.expected_delivery)}</p>}</td><td>{money(f.net)}</td></tr>;})}</tbody></table>{!orders.length&&<div className="empty">No customer orders match these filters.</div>}</div></div></>;
}
