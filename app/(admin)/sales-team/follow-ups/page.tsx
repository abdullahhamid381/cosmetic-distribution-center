import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {customerOrders,departmentFollowups} from '@/lib/sales-team-data';
import {pakistanToday} from '@/lib/sales-team';
import {formatDate} from '@/lib/utils';
import {DepartmentForm} from '@/components/DepartmentForm';
import {DepartmentStats} from '@/components/DepartmentStats';
import {addSalesFollowup,completeSalesFollowup} from '@/app/sales-department-actions';
export default async function Followups({searchParams}:{searchParams:Promise<{view?:string}>}){
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS','SALES'),scoped=user.role==='SALES'?user.id:null;
 const [orders,followups]=await Promise.all([customerOrders(scoped),departmentFollowups(scoped)]),{view='open'}=await searchParams;
 const day=(v:Date|string)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10),today=pakistanToday();
 const open=followups.filter(f=>!f.completed_at),overdue=open.filter(f=>day(f.due_date)<today);
 const visible=followups.filter(f=>view==='all'||(view==='completed'?!!f.completed_at:view==='overdue'?!f.completed_at&&day(f.due_date)<today:!f.completed_at));
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">SALES DEPARTMENT / CUSTOMER CARE</span><h1>Customer follow-ups</h1><p>Plan customer calls, track delivery issues, and retain the outcome against each order.</p></div></div>
 <DepartmentStats items={[["Open tasks",open.length],["Overdue",overdue.length],["Due today",open.filter(f=>day(f.due_date)===today).length],["Completed",followups.length-open.length]]}/>
 <form className="inline-form"><div className="field"><label htmlFor="view">Show tasks</label><select id="view" name="view" defaultValue={view}><option value="open">Open</option><option value="overdue">Overdue</option><option value="completed">Completed</option><option value="all">All tasks</option></select></div><button className="btn" type="submit">Filter</button></form>
 {user.role!=='ACCOUNTS'&&<div className="card section-gap"><h2>Schedule a follow-up</h2><DepartmentForm action={addSalesFollowup} submitLabel="Schedule follow-up"><div className="field"><label htmlFor="order_id">Customer order *</label><select id="order_id" name="order_id" required><option value="">Select order</option>{orders.map(o=><option key={o.id} value={o.id}>CO-{o.id} — {o.customer_name} / {o.phone}</option>)}</select></div><div className="field"><label htmlFor="due_date">Due date *</label><input id="due_date" name="due_date" type="date" defaultValue={today} required/></div><div className="field span-2"><label htmlFor="note">Action / customer requirement *</label><textarea id="note" name="note" placeholder="Confirm address, check courier delay, request customer confirmation..." required/></div></DepartmentForm></div>}
 <div className="section-gap">{!visible.length&&<div className="card empty">No follow-ups in this view.</div>}{visible.map(f=><div className="card section-gap" key={f.id}><div className="agent-card-header"><h2><Link href={'/sales-team/'+f.order_id}>CO-{f.order_id} · {f.customer_name}</Link></h2><span className={'badge '+(f.completed_at?'blue':day(f.due_date)<today?'red':'pending')}>{f.completed_at?'Completed':day(f.due_date)<today?'Overdue':'Open'}</span></div><p>{f.agent_name} · {f.phone} · Due {formatDate(f.due_date)}</p><p style={{whiteSpace:'pre-wrap'}}>{f.note}</p>{f.completed_at?<p className="success-note">{formatDate(f.completed_at)} — {f.outcome}</p>:user.role!=='ACCOUNTS'&&<DepartmentForm action={completeSalesFollowup} submitLabel="Complete follow-up" className="inline-form section-gap"><input type="hidden" name="followup_id" value={f.id}/><div className="field"><label htmlFor={'outcome-'+f.id}>Outcome *</label><input id={'outcome-'+f.id} name="outcome" required placeholder="What happened / agreed next step"/></div></DepartmentForm>}</div>)}</div></>;
}
