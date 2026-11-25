import {DeleteRecordButton} from '@/components/DeleteRecordButton';
import {deleteInvoiceFromList} from '@/app/record-actions';
import {records} from '@/lib/records';
import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {invoiceFilterQuery,type InvoiceFilterInput} from '@/lib/invoice-filters';
import {formatDate,money} from '@/lib/utils';

export default async function Invoices({searchParams}:{searchParams:Promise<InvoiceFilterInput & {deleted?:string;deleteError?:string}>}) {
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const params=await searchParams;
 const result=invoiceFilterQuery(params),f=result.filters;
 const canManage=records.invoices.roles.includes(user.role);
 const filters=new URLSearchParams(Object.entries(f).filter(([,value])=>value)).toString();
 const deleteAction=deleteInvoiceFromList.bind(null,filters);
 const [invoices,stores]=await Promise.all([result.error?Promise.resolve([]):query(result.sql,result.params),query('SELECT id,shop_name,active FROM shops ORDER BY shop_name,id')]);
 const totals=invoices.reduce((sum,i)=>({original:sum.original+Number(i.total),paid:sum.paid+Number(i.paid_total),credits:sum.credits+Number(i.credit_total),pending:sum.pending+Number(i.total)-Number(i.paid_total)-Number(i.credit_total)}),{original:0,paid:0,credits:0,pending:0});
 const filtered=Boolean(f.month||f.week||f.shop||f.from||f.to||f.status||f.q);
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">SALES / BILLING</span><h1>Invoices</h1><p>Find invoices by store name, month, week, custom date range, and payment status.</p></div>{['ADMIN','MANAGER'].includes(user.role)&&<Link href="/sales/new" className="btn primary">+ Create Invoice & Delivery</Link>}</div>
 {params.deleted==='1'&&<div className="notice section-gap" role="status">Invoice moved to <Link href="/trash?type=invoices">Trash</Link>. Dispatched stock was returned to the warehouse.</div>}
 {typeof params.deleteError==='string'&&<div className="notice section-gap" role="alert">{params.deleteError}</div>}
 <div className="card"><h2>Filter invoices</h2><form method="get" action="/invoices" className="form-grid section-gap">
 <div className="field"><label htmlFor="invoice-month">Invoice month</label><input id="invoice-month" type="month" name="month" defaultValue={f.month}/></div>
 <div className="field"><label htmlFor="invoice-week">Invoice week (Monday–Sunday)</label><input id="invoice-week" type="week" name="week" defaultValue={f.week}/></div>
 <div className="field"><label htmlFor="invoice-shop">Store / shop</label><select id="invoice-shop" name="shop" defaultValue={f.shop}><option value="">All stores</option>{stores.map(s=><option key={s.id} value={s.id}>{s.shop_name}{!s.active?' (Archived)':''}</option>)}</select></div>
 <div className="field"><label htmlFor="invoice-from">From issue date</label><input id="invoice-from" type="date" name="from" defaultValue={f.from}/></div>
 <div className="field"><label htmlFor="invoice-to">To issue date</label><input id="invoice-to" type="date" name="to" defaultValue={f.to}/></div>
 <div className="field"><label htmlFor="invoice-status">Payment status</label><select id="invoice-status" name="status" defaultValue={f.status}><option value="">All statuses</option><option value="pending">Any remaining balance</option><option value="unpaid">No payment received</option><option value="partial">Partially paid</option><option value="settled">Settled</option><option value="overdue">Overdue</option></select></div>
 <div className="field"><label htmlFor="invoice-search">Invoice number or store name</label><input id="invoice-search" name="q" maxLength={100} defaultValue={f.q} placeholder="INV-000001 or store name"/></div>
 <div className="field"><label htmlFor="invoice-sort">Sort by</label><select id="invoice-sort" name="sort" defaultValue={f.sort}><option value="newest">Newest invoices first</option><option value="oldest">Oldest invoices first</option><option value="due">Earliest due date</option><option value="balance">Highest remaining balance</option><option value="amount">Highest invoice amount</option></select></div>
 <div className="form-actions"><button type="submit" className="btn primary">Show invoices</button><Link className="btn outline" href="/invoices">Clear filters</Link></div></form><p className="card-sub">Both dates are included. Filters work together: choosing a month, week, or custom dates shows only their overlap. Weeks run Monday to Sunday. Leave fields blank to include all records. Balances reflect current payments and return credits.</p></div>
 {result.error?<div className="notice section-gap" role="alert">{result.error}</div>:<><div className="stats-grid section-gap">{[['Original invoice amount',totals.original],['Received payment',totals.paid],['Return credits',totals.credits],['Remaining payment',totals.pending]].map(([label,value])=><div className="card stat" key={String(label)}><div className="stat-top">{label}</div><strong>{money(Number(value))}</strong></div>)}</div>
 <div className="card section-gap"><div className="card-header"><h2>{filtered?'Matching invoices':'All invoices'}</h2><span className="badge blue">{invoices.length} {invoices.length===1?'invoice':'invoices'}</span></div><div className="table-wrap"><table><thead><tr><th>Invoice No</th><th>Shop</th><th>Issued</th><th>Due</th><th>Invoice Total</th><th>Paid</th><th>Return Credit</th><th>Pending</th><th>Status</th><th>Details / Payment</th><th>Actions</th></tr></thead><tbody>{invoices.map(i=>{const due=Number(i.total)-Number(i.paid_total)-Number(i.credit_total);return <tr key={i.id}><td className="table-name mono"><Link href={`/invoices/${i.id}`}>{i.invoice_no}</Link></td><td>{i.shop_name}</td><td>{formatDate(i.issue_date)}</td><td>{formatDate(i.due_date)}</td><td>{money(i.total)}</td><td className="money-positive">{money(i.paid_total)}</td><td>{money(i.credit_total)}</td><td className={due?'money-negative':'money-positive'}>{money(due)}</td><td><span className={`badge ${i.overdue?'red':due?'pending':''}`}>{i.overdue?'Overdue':!due?'Settled':Number(i.paid_total)>0?'Partially paid':'Unpaid'}</span></td><td>{due>0&&<Link className="btn primary" href={`/invoices/${i.id}/request`}>Request payment</Link>}<Link className="btn" href={`/invoices/${i.id}`}>Open →</Link></td><td>{canManage&&<div className="actions"><Link className="btn outline" href={`/manage/invoices/${i.id}`}>Edit</Link><form action={deleteAction}><input type="hidden" name="id" value={i.id}/><DeleteRecordButton message={records.invoices.deletion}/></form></div>}</td></tr>})}</tbody></table>{!invoices.length&&<div className="empty">{filtered?'No invoices match these filters. Try another store, month, week, date range, or status.':'No invoices yet. Create a delivery to issue your first invoice.'}</div>}</div></div></>}
 </>;
}
