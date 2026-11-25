import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {money} from '@/lib/utils';
import {validDate} from '@/lib/sales-team';
import {ShareFieldPdf} from '@/components/ShareFieldPdf';
import '../../sales-team/sales-department.css';

const pageSize = 25;

export default async function FieldCollections({searchParams}: {
  searchParams: Promise<{q?:string; collector?:string; from?:string; to?:string; page?:string}>;
}) {
  await requireRole('ADMIN','MANAGER');
  const input = await searchParams;
  const term = typeof input.q==='string' ? input.q.trim().slice(0,100) : '';
  const from = typeof input.from==='string' ? input.from : '';
  const to = typeof input.to==='string' ? input.to : '';
  let error = '';
  try {
    if (from) validDate(from);
    if (to) validDate(to);
    if (from && to && from>to) error='The end date must be on or after the start date.';
  } catch {
    error='Choose valid payment dates.';
  }

  const collectors = await query<{id:string;full_name:string}>(`SELECT u.id,u.full_name FROM users u
    WHERE EXISTS(SELECT 1 FROM payments p WHERE p.created_by=u.id AND p.field_submission_id IS NOT NULL)
    ORDER BY u.full_name,u.id`);
  const collector = collectors.find(person=>person.id===input.collector)?.id ?? '';
  const filters = [term,collector||null,from||null,to||null];
  const scope = `FROM payments p JOIN shops s ON s.id=p.shop_id
    WHERE p.field_submission_id IS NOT NULL
    AND ($1='' OR strpos(lower(concat_ws(' ',s.shop_name,s.city,p.payment_no)),lower($1))>0)
    AND ($2::bigint IS NULL OR p.created_by=$2)
    AND ($3::date IS NULL OR p.payment_date >= $3)
    AND ($4::date IS NULL OR p.payment_date <= $4)`;
  const [summary] = error ? [] : await query<{total:string;amount:string;shops:string}>(`
    SELECT COUNT(*) AS total,COALESCE(SUM(p.amount),0) AS amount,COUNT(DISTINCT p.shop_id) AS shops ${scope}`,filters);
  const total = Number(summary?.total ?? 0);
  const pages = Math.max(1,Math.ceil(total/pageSize));
  const requested = Number(input.page);
  const page = Number.isSafeInteger(requested) ? Math.min(pages,Math.max(1,requested)) : 1;
  const rows = error || !total ? [] : await query(`WITH matching AS (
    SELECT p.id,p.payment_no,p.amount,p.method,p.payment_date,p.created_at,p.created_by,
      p.shop_id,s.shop_name,s.phone
    ${scope}
    ORDER BY p.payment_date DESC,p.id DESC LIMIT $5 OFFSET $6
  ) SELECT p.*,u.full_name AS collector,to_char(p.payment_date,'DD Mon YYYY') AS paid_on,
    to_char(p.created_at AT TIME ZONE 'Asia/Karachi','DD Mon YYYY HH24:MI') AS recorded_at,
    (SELECT string_agg(i.invoice_no,', ' ORDER BY i.due_date,i.id)
     FROM payment_allocations a JOIN invoices i ON i.id=a.invoice_id WHERE a.payment_id=p.id) AS invoices
    FROM matching p LEFT JOIN users u ON u.id=p.created_by ORDER BY p.payment_date DESC,p.id DESC`,
    [...filters,pageSize,(page-1)*pageSize]);
  const href = (number:number) => '/field/collections?'+new URLSearchParams({
    q:term,collector,from,to,page:String(number),
  });

  return <div className="sales-department">
    <div className="page-title-row">
      <div className="page-title"><h1>Field Collections</h1>
        <p>Review who collected each payment, which invoices it covered, and when it was recorded.</p>
      </div>
      <div className="actions">
        <Link className="btn" href="/field/access">Manage shop access</Link>
        <Link className="btn" href="/field">Back to Field Sales</Link>
      </div>
    </div>
    <form className="card inline-form" action="/field/collections">
      <label className="field">Shop or receipt<input name="q" defaultValue={term} maxLength={100}/></label>
      <label className="field">Collected by<select name="collector" defaultValue={collector}>
        <option value="">All collectors</option>
        {collectors.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}
      </select></label>
      <label className="field">From<input type="date" name="from" defaultValue={from}/></label>
      <label className="field">To<input type="date" name="to" defaultValue={to}/></label>
      <button className="btn primary" type="submit">Filter</button>
      {(term||collector||from||to)&&<Link className="btn" href="/field/collections">Clear filters</Link>}
    </form>
    {error ? <p className="notice section-gap" role="alert">{error}</p> : <>
      <div className="stats-grid section-gap" aria-label="Collection totals for the selected filters">
        <div className="card stat"><span className="stat-top">Amount collected</span><strong>{money(summary?.amount)}</strong></div>
        <div className="card stat"><span className="stat-top">Payments</span><strong>{total.toLocaleString('en-PK')}</strong></div>
        <div className="card stat"><span className="stat-top">Shops paid</span><strong>{Number(summary?.shops??0).toLocaleString('en-PK')}</strong></div>
      </div>
      <section className="card section-gap">
        <div className="card-header"><div><h2>Collection records</h2>
          <p className="card-sub">Share the receipt PDF, or download it and attach it in the customer’s WhatsApp chat.</p></div>
        </div>
        {!rows.length ? <p className="empty">No field collections match these filters.</p> : <div className="table-wrap">
          <table>
            <thead><tr><th>Receipt</th><th>Shop</th><th>Collected by</th><th>Amount</th><th>Recorded</th><th>Share receipt</th></tr></thead>
            <tbody>{rows.map(row=><tr key={row.id}>
              <td><strong>{row.payment_no}</strong><div className="muted">{row.paid_on} · {row.method}</div>
                {row.invoices && <div className="muted">{row.invoices}</div>}</td>
              <td><Link className="table-name" href={'/field?shop='+row.shop_id}>{row.shop_name}</Link></td>
              <td>{row.collector || 'Not recorded'}</td><td>{money(row.amount)}</td><td>{row.recorded_at} PKT</td>
              <td><ShareFieldPdf kind="receipt" id={String(row.id)} customerPhone={row.phone}/></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {pages>1&&<nav className="actions section-gap" aria-label="Collection pages">
          {page>1&&<Link className="btn" href={href(page-1)}>Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page<pages&&<Link className="btn" href={href(page+1)}>Next</Link>}
        </nav>}
      </section>
    </>}
  </div>;
}
