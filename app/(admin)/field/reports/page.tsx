import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {fieldOwner} from '@/lib/field-sales';
import {validDate} from '@/lib/sales-team';
import {money} from '@/lib/utils';
import '../../sales-team/sales-department.css';

const pageSize=35;
const statusLabels:Record<string,string>={UNSUBMITTED:'Not submitted',SUBMITTED:'Awaiting admin',APPROVED:'Approved',ADMIN_RECEIVED:'Received directly by admin'};

export default async function FieldReports({searchParams}:{
  searchParams:Promise<{person?:string;from?:string;to?:string;page?:string}>;
}) {
  const user=await requireRole('ADMIN','MANAGER','SALES','FIELD_SALES');
  const owner=fieldOwner(user);
  const input=await searchParams;
  const from=typeof input.from==='string'?input.from:'',to=typeof input.to==='string'?input.to:'';
  let invalid=false;
  try {
    if(from)validDate(from);
    if(to)validDate(to);
    invalid=Boolean(from&&to&&from>to);
  } catch {invalid=true;}
  const people=owner===null?await query<{id:string;full_name:string}>(`SELECT u.id,u.full_name FROM users u
    WHERE u.role IN ('SALES','FIELD_SALES') OR EXISTS(
      SELECT 1 FROM audit_logs a WHERE a.user_id=u.id AND a.action='FIELD_REGISTER_SHOP'
    ) OR EXISTS(SELECT 1 FROM payments p WHERE p.created_by=u.id AND p.field_submission_id IS NOT NULL)
    ORDER BY u.full_name,u.id`):[];
  const person=owner===null?people.find(entry=>entry.id===input.person)?.id??'':'';
  const filters=[owner??(person||null),from||null,to||null];
  const activity=`WITH activity AS (
    SELECT 'SHOP' AS kind,a.id,a.user_id AS person_id,s.id AS shop_id,s.shop_name,s.city,
      NULL::text AS reference,NULL::text AS method,0::numeric AS amount,NULL::text AS status,
      a.created_at AS recorded_at,(a.created_at AT TIME ZONE 'Asia/Karachi')::date AS occurred_on
    FROM audit_logs a JOIN shops s ON s.id=a.entity_id
    WHERE a.action='FIELD_REGISTER_SHOP' AND a.entity='shop'
      AND ($1::bigint IS NULL OR a.user_id=$1)
      AND ($2::date IS NULL OR (a.created_at AT TIME ZONE 'Asia/Karachi')::date >= $2)
      AND ($3::date IS NULL OR (a.created_at AT TIME ZONE 'Asia/Karachi')::date <= $3)
    UNION ALL
    SELECT 'PAYMENT',p.id,p.created_by,s.id,s.shop_name,s.city,p.payment_no,p.method,p.amount,
      COALESCE(h.status,CASE WHEN COALESCE(entry.details->>'collectorRole',u.role)='ADMIN'
        THEN 'ADMIN_RECEIVED' ELSE 'UNSUBMITTED' END),p.created_at,p.payment_date
    FROM payments p JOIN shops s ON s.id=p.shop_id
    LEFT JOIN users u ON u.id=p.created_by
    LEFT JOIN LATERAL (
      SELECT details FROM audit_logs WHERE entity='payment' AND entity_id=p.id AND action='FIELD_COLLECT_PAYMENT'
      ORDER BY id DESC LIMIT 1
    ) entry ON true
    LEFT JOIN field_payment_handover_items i ON i.payment_id=p.id AND i.released_at IS NULL
    LEFT JOIN field_payment_handovers h ON h.id=i.handover_id
    WHERE p.field_submission_id IS NOT NULL
      AND ($1::bigint IS NULL OR p.created_by=$1)
      AND ($2::date IS NULL OR p.payment_date >= $2)
      AND ($3::date IS NULL OR p.payment_date <= $3)
  )`;
  const breakdown=invalid?[]:await query(`${activity}
    SELECT person_id,u.full_name,COUNT(*) FILTER(WHERE kind='SHOP') AS registered,
      COUNT(*) FILTER(WHERE kind='PAYMENT') AS payments,COUNT(*) AS entries,
      COALESCE(SUM(amount),0) AS recovered,
      COALESCE(SUM(amount) FILTER(WHERE status='UNSUBMITTED'),0) AS unsubmitted,
      COALESCE(SUM(amount) FILTER(WHERE status='SUBMITTED'),0) AS submitted,
      COALESCE(SUM(amount) FILTER(WHERE status='APPROVED'),0) AS approved,
      COALESCE(SUM(amount) FILTER(WHERE status='ADMIN_RECEIVED'),0) AS direct,
      COALESCE(SUM(amount) FILTER(WHERE method='CASH' AND status IN ('UNSUBMITTED','SUBMITTED')),0) AS unconfirmed_cash
    FROM activity LEFT JOIN users u ON u.id=person_id
    GROUP BY person_id,u.full_name ORDER BY u.full_name,person_id`,filters);
  const total=breakdown.reduce((sum,row)=>sum+Number(row.entries),0);
  const pages=Math.max(1,Math.ceil(total/pageSize)),requested=Number(input.page);
  const page=Number.isSafeInteger(requested)?Math.min(pages,Math.max(1,requested)):1;
  const records=!total?[]:await query(`${activity}
    SELECT a.*,u.full_name,to_char(a.occurred_on,'DD Mon YYYY') AS date,
      to_char(a.recorded_at AT TIME ZONE 'Asia/Karachi','DD Mon YYYY HH24:MI') AS recorded,
      CASE WHEN a.kind='PAYMENT' THEN (SELECT string_agg(i.invoice_no,', ' ORDER BY i.due_date,i.id)
        FROM payment_allocations l JOIN invoices i ON i.id=l.invoice_id WHERE l.payment_id=a.id) END AS invoices
    FROM activity a LEFT JOIN users u ON u.id=a.person_id
    ORDER BY a.occurred_on DESC,a.recorded_at DESC,a.kind,a.id DESC LIMIT $4 OFFSET $5`,[...filters,pageSize,(page-1)*pageSize]);
  const totals=breakdown.reduce((sum,row)=>({
    registered:sum.registered+Number(row.registered),
    recovered:sum.recovered+Math.round(Number(row.recovered)*100),
    held:sum.held+Math.round(Number(row.unsubmitted)*100)+Math.round(Number(row.submitted)*100),
    received:sum.received+Math.round(Number(row.approved)*100)+Math.round(Number(row.direct)*100),
    cash:sum.cash+Math.round(Number(row.unconfirmed_cash)*100),
  }),{registered:0,recovered:0,held:0,received:0,cash:0});
  const href=(number:number)=>'/field/reports?'+new URLSearchParams({person,from,to,page:String(number)});

  return <div className="sales-department">
    <div className="page-title-row"><div className="page-title"><h1>{owner===null?'Field Sales Report':'My Field Sales Report'}</h1>
      <p>Review shop registrations, invoice recovery, and payments awaiting handover approval.</p></div>
      <div className="actions"><Link className="btn primary" href="/field/handovers">Payment handovers</Link><Link className="btn" href="/field">Field Sales</Link></div>
    </div>
    <form className="card inline-form" action="/field/reports">
      {owner===null&&<label className="field">Salesperson<select name="person" defaultValue={person}>
        <option value="">Everyone</option>{people.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select></label>}
      <label className="field">From<input type="date" name="from" defaultValue={from}/></label>
      <label className="field">To<input type="date" name="to" defaultValue={to}/></label>
      <button type="submit" className="btn primary">Apply filters</button><Link className="btn" href="/field/reports">Clear</Link>
    </form>
    {invalid?<p className="notice section-gap" role="alert">Choose a valid date range.</p>:<>
      <div className="stats-grid section-gap">
        {[
          ['Shops registered',String(totals.registered)],['Total recovered',money(totals.recovered/100)],
          ['Unapproved handover balance',money(totals.held/100)],['Cash awaiting confirmation',money(totals.cash/100)],
          ['Received by admin',money(totals.received/100)],
        ].map(([label,value])=><div key={label} className="card stat"><span className="stat-top">{label}</span><strong>{value}</strong></div>)}
      </div>
      <section className="card section-gap">
        <div className="card-header"><div><h2>{owner===null?'Recovery by salesperson':'My recovery breakdown'}</h2>
          <p className="card-sub">Unapproved includes payments still to submit and submissions awaiting admin review.</p></div></div>
        {!breakdown.length?<p className="empty">No field activity in this date range.</p>:<div className="table-wrap"><table>
          <thead><tr><th>Salesperson</th><th>Shops registered</th><th>Payments</th><th>Recovered</th><th>Not submitted</th><th>Awaiting admin</th><th>Cash awaiting confirmation</th><th>Approved</th><th>Received directly by admin</th></tr></thead>
          <tbody>{breakdown.map(row=><tr key={row.person_id??'unknown'}><td>{row.full_name||'Not recorded'}</td><td>{row.registered}</td><td>{row.payments}</td>
            <td>{money(row.recovered)}</td><td>{money(row.unsubmitted)}</td><td>{money(row.submitted)}</td>
            <td>{money(row.unconfirmed_cash)}</td><td>{money(row.approved)}</td><td>{money(row.direct)}</td></tr>)}</tbody>
        </table></div>}
      </section>
      <section className="card section-gap">
        <div className="card-header"><h2>Shop and payment activity</h2></div>
        {!records.length?<p className="empty">No activity to show.</p>:<div className="table-wrap"><table>
          <thead><tr><th>Activity date</th><th>Shop</th><th>Recorded by</th><th>Activity</th><th>Amount</th><th>Handover status</th></tr></thead>
          <tbody>{records.map(row=><tr key={row.kind+row.id}>
            <td>{row.date}<div className="muted">{row.recorded} PKT</div></td><td>{row.shop_name}{row.city&&<div className="muted">{row.city}</div>}</td>
            <td>{row.full_name||'Not recorded'}</td><td>{row.kind==='SHOP'?'Registered shop':<>
              {row.reference} · {row.method}{row.invoices&&<div className="muted">{row.invoices}</div>}
            </>}</td><td>{row.kind==='PAYMENT'?money(row.amount):'—'}</td>
            <td>{row.kind==='PAYMENT'?<span className={`badge ${['APPROVED','ADMIN_RECEIVED'].includes(row.status)?'':'pending'}`}>{statusLabels[row.status]}</span>:'—'}</td>
          </tr>)}</tbody>
        </table></div>}
        {pages>1&&<nav className="actions section-gap" aria-label="Field report pages">
          {page>1&&<Link className="btn" href={href(page-1)}>Previous</Link>}<span>Page {page} of {pages}</span>
          {page<pages&&<Link className="btn" href={href(page+1)}>Next</Link>}
        </nav>}
      </section>
    </>}
  </div>;
}
