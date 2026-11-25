import Link from 'next/link';
import {requireAgent} from '@/lib/agent-portal';
import {customerOrders,departmentAgents,departmentFollowups} from '@/lib/sales-team-data';
import {agentPerformance,targetMonth} from '@/lib/sales-department';
import {orderStatuses,paymentBalance} from '@/lib/sales-team';
import {money,formatDate} from '@/lib/utils';
import {DepartmentStats} from '@/components/DepartmentStats';
import {AgentOrdersTable} from '@/components/AgentOrdersTable';
export default async function MyAgentPortal(){
 const {user,profile}=await requireAgent(),month=targetMonth();
 const [orders,agents,followups]=await Promise.all([customerOrders(user.id),departmentAgents(user.id,month+'-01'),departmentFollowups(user.id)]);
 const agent=agents[0],p=agentPerformance(orders,String(profile.id),Number(agent?.paid||0),month),due=orders.reduce((s,o)=>s+Math.round(paymentBalance(o).due*100),0)/100;
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">MY PRIVATE SALES PORTAL</span><h1>Welcome, {user.name}</h1><p>Add your customer orders and follow their payment and delivery progress.</p></div><Link className="btn primary" href="/agent/new">+ Add customer order</Link></div>
 <DepartmentStats items={[["My customer orders",orders.length],["Delivered this month",p.delivered],["Expected commission on open orders",money(p.expected)],["Return charges deducted",money(p.returnDeductions)],["Amount I owe",money(p.recovery)],["My commission due",money(p.due)],["My customers’ amount due",money(due)]]}/>
 <div className="card"><h2>My order progress</h2><div className="pipeline section-gap">{orderStatuses.map(s=><Link key={s} href={'/agent/orders?status='+s}><span>{s}</span><strong>{orders.filter(o=>o.status===s).length}</strong><span>View my orders →</span></Link>)}</div></div>
 <div className="department-grid section-gap"><div className="card"><h2>My monthly target · {month}</h2><div className="metric-row"><span>Delivered retail sales</span><b>{money(p.retail)}</b></div><div className="metric-row"><span>Retail target</span><b>{Number(agent?.retail_target)?money(agent.retail_target):'Not assigned'}</b></div><div className="metric-row"><span>Delivered orders / target</span><b>{p.delivered} / {agent?.order_target||'Not assigned'}</b></div>{Number(agent?.retail_target)>0&&<progress aria-label="My retail target achievement" max="100" value={Math.min(100,p.retail/Number(agent.retail_target)*100)}/>}<Link className="btn section-gap" href="/agent/commissions">My commission account</Link></div><div className="card"><h2>My open follow-ups</h2><div className="department-action-list">{followups.filter(f=>!f.completed_at).slice(0,5).map(f=><Link key={f.id} href={'/agent/orders/'+f.order_id}><span>{f.customer_name}<br/>{f.note}</span><b>{formatDate(f.due_date)}</b></Link>)}</div>{!followups.some(f=>!f.completed_at)&&<p className="compact-note">No open customer follow-ups.</p>}</div></div>
 <div className="card section-gap"><div className="agent-card-header"><h2>My recent orders</h2><Link className="btn" href="/agent/orders">View all my orders</Link></div><AgentOrdersTable orders={orders.slice(0,10)}/></div></>;
}
