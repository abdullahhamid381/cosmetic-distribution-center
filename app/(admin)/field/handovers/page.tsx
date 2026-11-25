import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {fieldOwner} from '@/lib/field-sales';
import {money} from '@/lib/utils';
import {DepartmentForm} from '@/components/DepartmentForm';
import {FieldLocation} from '@/components/FieldLocation';
import {reviewFieldHandover, submitFieldHandover} from '@/app/field-handover-actions';
import '../../sales-team/sales-department.css';

const pageSize=20;
const statusLabels:Record<string,string>={SUBMITTED:'Awaiting approval',APPROVED:'Approved',REJECTED:'Rejected'};

type HandoverItem={receipt:string;shop:string;amount:string;method:string};

export default async function FieldHandovers({searchParams}:{
  searchParams:Promise<{status?:string;page?:string}>;
}) {
  const user=await requireRole('ADMIN','MANAGER','SALES','FIELD_SALES');
  const owner=fieldOwner(user);
  const input=await searchParams;
  const statuses=Object.keys(statusLabels);
  const status=statuses.includes(input.status??'')?input.status!:user.role==='ADMIN'&&input.status===undefined?'SUBMITTED':'';
  const countArgs=[owner,status||null];
  const [eligible,counts]=await Promise.all([
    user.role==='ADMIN'?[]:query(`SELECT p.id,p.payment_no,p.method,p.amount,s.shop_name,
      to_char(p.payment_date,'DD Mon YYYY') AS payment_date
      FROM payments p JOIN shops s ON s.id=p.shop_id
      WHERE p.created_by=$1 AND p.field_submission_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM field_payment_handover_items i WHERE i.payment_id=p.id AND i.released_at IS NULL)
      ORDER BY p.payment_date,p.id LIMIT 60`,[user.id]),
    query(`SELECT COUNT(*) AS total FROM field_payment_handovers h
      WHERE ($1::bigint IS NULL OR h.submitted_by=$1) AND ($2::text IS NULL OR h.status=$2)`,countArgs),
  ]);
  const total=Number(counts[0].total),pages=Math.max(1,Math.ceil(total/pageSize)),requested=Number(input.page);
  const page=Number.isSafeInteger(requested)?Math.min(pages,Math.max(1,requested)):1;
  const handovers=total?await query(`SELECT h.id,h.status,h.note,h.review_note,h.amount,h.cash_amount,u.full_name AS salesperson,
    reviewer.full_name AS reviewer,
    to_char(h.submitted_at AT TIME ZONE 'Asia/Karachi','DD Mon YYYY HH24:MI') AS submitted,
    to_char(h.reviewed_at AT TIME ZONE 'Asia/Karachi','DD Mon YYYY HH24:MI') AS reviewed,
    (SELECT jsonb_agg(jsonb_build_object('receipt',i.receipt_number,'shop',i.shop_name,
      'amount',i.amount::text,'method',i.method) ORDER BY i.id)
      FROM field_payment_handover_items i WHERE i.handover_id=h.id) AS items
    FROM field_payment_handovers h JOIN users u ON u.id=h.submitted_by LEFT JOIN users reviewer ON reviewer.id=h.reviewed_by
    WHERE ($1::bigint IS NULL OR h.submitted_by=$1) AND ($2::text IS NULL OR h.status=$2)
    ORDER BY (h.status='SUBMITTED') DESC,h.submitted_at DESC,h.id DESC LIMIT $3 OFFSET $4`,
    [...countArgs,pageSize,(page-1)*pageSize]):[];
  const href=(number:number)=>'/field/handovers?'+new URLSearchParams({status,page:String(number)});

  return <div className="sales-department">
    <div className="page-title-row"><div className="page-title"><h1>Payment Handovers</h1>
      <p>{user.role==='ADMIN'?'Verify the submitted collections and approve or reject each handover.':'Submit collections for admin review and track which handovers have been approved.'}</p></div>
      <div className="actions"><Link className="btn" href="/field/reports">Field Sales report</Link><Link className="btn" href="/field">Field Sales</Link></div>
    </div>

    {user.role!=='ADMIN'&&<section className="card">
      <div className="card-header"><div><h2>Submit my collections</h2>
        <p className="card-sub">Select receipts to include. Cash is shown separately from bank transfers and other payment methods.</p></div></div>
      {!eligible.length?<p className="empty">You have no unsubmitted Field Sales collections.</p>:
        <DepartmentForm action={submitFieldHandover} submitLabel="Submit to admin">
          <div className="field span-2"><div className="table-wrap"><table>
            <thead><tr><th>Select</th><th>Receipt</th><th>Shop</th><th>Paid on</th><th>Method</th><th>Amount</th></tr></thead>
            <tbody>{eligible.map(payment=><tr key={payment.id}>
              <td><input type="checkbox" name="payment_id" value={payment.id} aria-label={'Select receipt '+payment.payment_no}/></td>
              <td>{payment.payment_no}</td><td>{payment.shop_name}</td><td>{payment.payment_date}</td>
              <td>{payment.method}</td><td>{money(payment.amount)}</td>
            </tr>)}</tbody>
          </table></div>{eligible.length===60&&<p className="card-sub">Showing the oldest 60 unsubmitted receipts.</p>}</div>
          <label className="field span-2">Handover note<textarea name="note" maxLength={500} placeholder="Cash handover or transfer reference"/></label>
          <FieldLocation/>
        </DepartmentForm>}
    </section>}

    <section className="card section-gap">
      <div className="card-header"><div><h2>{owner===null?'Handover register':'My handover history'}</h2>
        <p className="card-sub">Review receipts, totals, submission dates, and admin decisions. Handover approval does not post a second customer payment.</p></div></div>
      <form className="inline-form" action="/field/handovers">
        <label className="field">Status<select name="status" defaultValue={status}>
          <option value="">All statuses</option>{statuses.map(value=><option key={value} value={value}>{statusLabels[value]}</option>)}
        </select></label><button className="btn" type="submit">Filter</button>
      </form>
      {!handovers.length?<p className="empty section-gap">No handovers match this filter.</p>:<div className="stack section-gap">
        {handovers.map(handover=><details className="card" key={handover.id}>
          <summary>
            <strong>#{handover.id} · {handover.salesperson}</strong>{' · '}
            {money(handover.amount)}{' · '}
            <span className={`badge ${handover.status==='REJECTED'?'red':handover.status==='SUBMITTED'?'pending':''}`}>{statusLabels[handover.status]}</span>
          </summary>
          <div className="section-gap">
            <p>Submitted {handover.submitted} PKT · Cash {money(handover.cash_amount)} · Other methods {money((Math.round(Number(handover.amount)*100)-Math.round(Number(handover.cash_amount)*100))/100)}</p>
            {handover.note&&<p className="muted">Handover note {handover.note}</p>}
            {handover.reviewed&&<p className="muted">Reviewed by {handover.reviewer} on {handover.reviewed} PKT{handover.review_note?' · '+handover.review_note:''}</p>}
            <div className="table-wrap"><table>
              <thead><tr><th>Receipt</th><th>Shop</th><th>Method</th><th>Amount</th></tr></thead>
              <tbody>{(handover.items as HandoverItem[] ?? []).map(item=><tr key={item.receipt}>
                <td>{item.receipt}</td><td>{item.shop}</td><td>{item.method}</td><td>{money(item.amount)}</td>
              </tr>)}</tbody>
            </table></div>
            {user.role==='ADMIN'&&handover.status==='SUBMITTED'&&<DepartmentForm action={reviewFieldHandover} submitLabel="Save decision">
              <input type="hidden" name="handover_id" value={handover.id}/>
              <label className="field">Decision<select name="decision" defaultValue="" required>
                <option value="" disabled>Choose a decision</option><option value="APPROVED">Approve handover</option><option value="REJECTED">Reject handover</option>
              </select></label>
              <label className="field">Review note<input name="review_note" maxLength={500} placeholder="Required when rejecting"/></label>
              <FieldLocation/>
            </DepartmentForm>}
          </div>
        </details>)}
      </div>}
      {pages>1&&<nav className="actions section-gap" aria-label="Handover pages">
        {page>1&&<Link className="btn" href={href(page-1)}>Previous</Link>}<span>Page {page} of {pages}</span>
        {page<pages&&<Link className="btn" href={href(page+1)}>Next</Link>}
      </nav>}
    </section>
  </div>;
}
