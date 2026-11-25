import Link from 'next/link';
import {BookOpen, ClipboardList, MapPin, Store, Wallet} from 'lucide-react';
import {randomUUID} from 'node:crypto';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {activeFieldSeller, fieldOwner} from '@/lib/field-sales';
import {money} from '@/lib/utils';
import {pakistanToday} from '@/lib/closing-period';
import {DepartmentForm} from '@/components/DepartmentForm';
import {FieldLocation} from '@/components/FieldLocation';
import {FieldBookingLines} from '@/components/FieldBookingLines';
import {ShareFieldPdf} from '@/components/ShareFieldPdf';
import {bookFieldStock, cancelFieldBooking, collectFieldPayment, saveFieldShop} from '@/app/field-sales-actions';
import '../sales-team/sales-department.css';

type Shop = {id:string; shop_name:string; contact_name:string|null; phone:string|null; address:string|null;
  city:string|null; assigned_sales_id:string|null; seller:string|null; registered_by:string|null};
const shopFields = [
  ['shop_name','Shop name',140], ['contact_name','Contact name',120], ['phone','Phone',40],
  ['city','City',100], ['address','Address',300],
] as const;

function ShopFields({shop, agents}: {shop?:Shop; agents?:{id:string; full_name:string}[]}) {
  return <>
    {shop && <input name="shop_id" type="hidden" value={shop.id}/>}
    {shopFields.map(([key,label,maxLength]) => <label className={`field ${key==='address'?'span-2':''}`} key={key}>
      {label}<input name={key} required={key==='shop_name'} type={key==='phone'?'tel':'text'}
        maxLength={maxLength} defaultValue={shop?.[key] ?? ''}/>
    </label>)}
    {agents && <label className="field span-2">Assigned seller
      <select name="assigned_sales_id" defaultValue={shop?.assigned_sales_id ?? ''}>
        <option value="">{shop?.assigned_sales_id ? 'Keep current seller' : 'Unassigned'}</option>
        {shop?.assigned_sales_id && <option value="unassigned">Remove seller assignment</option>}
        {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
      </select>
    </label>}
    <FieldLocation/>
  </>;
}

const actions: Record<string,string> = {
  FIELD_REGISTER_SHOP:'Registered shop', FIELD_UPDATE_SHOP:'Updated shop', FIELD_BOOK_STOCK:'Booked stock',
  FIELD_FULFILL_BOOKING:'Dispatched booking', FIELD_CANCEL_BOOKING:'Cancelled booking',
  FIELD_COLLECT_PAYMENT:'Collected payment', CREATE:'Registered shop', UPDATE:'Updated shop',
  FIELD_ASSIGN_SHOP:'Changed shop access',
  RECORD_PAYMENT:'Collected payment',
};

export default async function FieldSales({searchParams}: {searchParams:Promise<{shop?:string; received?:string; new?:string}>}) {
  const user = await requireRole('SALES','FIELD_SALES','ADMIN','MANAGER');
  const owner = fieldOwner(user);
  const selection = await searchParams;
  const [shops, products, agents, queue] = await Promise.all([
    query<Shop>(`SELECT s.id,s.shop_name,s.contact_name,s.phone,s.address,s.city,s.assigned_sales_id,
      seller.full_name AS seller,registrar.full_name AS registered_by
      FROM shops s LEFT JOIN users seller ON seller.id=s.assigned_sales_id
      LEFT JOIN LATERAL (SELECT user_id FROM audit_logs WHERE entity='shop' AND entity_id=s.id
        AND action IN ('CREATE','FIELD_REGISTER_SHOP') ORDER BY id LIMIT 1) registration ON true
      LEFT JOIN users registrar ON registrar.id=registration.user_id
      WHERE s.active AND ($1::bigint IS NULL OR s.assigned_sales_id=$1) ORDER BY s.shop_name,s.id`,[owner]),
    query<{id:string;label:string}>("SELECT id, name||' · '||sku AS label FROM products WHERE active ORDER BY name"),
    owner===null ? query<{id:string;full_name:string}>(`SELECT u.id,u.full_name FROM users u
      WHERE ${activeFieldSeller} ORDER BY u.full_name`) : undefined,
    owner===null ? query(`SELECT b.id,b.shop_id,s.shop_name,u.full_name AS seller,
      to_char(b.created_at AT TIME ZONE 'Asia/Karachi','DD Mon YYYY HH24:MI') AS date
      FROM field_stock_bookings b JOIN shops s ON s.id=b.shop_id JOIN users u ON u.id=b.created_by
      WHERE b.status='PENDING' AND s.active ORDER BY b.created_at,b.id LIMIT 20`) : [],
  ]);
  const shop = shops.find(row => row.id === selection.shop) ?? shops[0];
  const params = [shop?.id,owner];
  const [bookings, invoices, payments, activity] = shop ? await Promise.all([
    query(`SELECT b.id,b.status,b.invoice_id,b.note,u.full_name AS seller,
      to_char(b.created_at AT TIME ZONE 'Asia/Karachi','DD Mon YYYY HH24:MI') AS booked_at,
      (SELECT jsonb_agg(p.name || ' × ' || (item->>'quantity') ORDER BY p.name)
       FROM jsonb_array_elements(b.items) item JOIN products p ON p.id=(item->>'productId')::bigint) AS products
      FROM field_stock_bookings b JOIN users u ON u.id=b.created_by JOIN shops s ON s.id=b.shop_id
      WHERE b.shop_id=$1 AND ($2::bigint IS NULL OR s.assigned_sales_id=$2)
      ORDER BY b.created_at DESC,b.id DESC LIMIT 40`,params),
    query(`SELECT i.id,i.invoice_no,i.total,i.total-i.paid_total-i.credit_total AS due,
      to_char(i.issue_date,'DD Mon YYYY') AS issued
      FROM invoices i JOIN shops s ON s.id=i.shop_id WHERE i.shop_id=$1
      AND ($2::bigint IS NULL OR s.assigned_sales_id=$2)
      ORDER BY (i.total>i.paid_total+i.credit_total) DESC,i.issue_date DESC,i.id DESC`,params),
    query(`SELECT p.id,p.payment_no,p.amount,p.method,u.full_name AS collector,to_char(p.payment_date,'DD Mon YYYY') AS date,
      entry.details->>'invoiceId' AS invoice_id,
      COALESCE(entry.details ? 'combinedInvoices',false) AS combined
      FROM payments p JOIN shops s ON s.id=p.shop_id LEFT JOIN users u ON u.id=p.created_by
      LEFT JOIN LATERAL (
        SELECT details FROM audit_logs WHERE entity='payment' AND entity_id=p.id AND action='FIELD_COLLECT_PAYMENT'
        ORDER BY id DESC LIMIT 1
      ) entry ON p.field_submission_id IS NOT NULL
      WHERE p.shop_id=$1 AND ($2::bigint IS NULL OR (s.assigned_sales_id=$2 AND p.created_by=$2))
      ORDER BY p.id DESC LIMIT 30`,params),
    query(`SELECT a.id,a.action,a.entity_id,a.details,u.full_name AS actor,
      to_char(a.created_at AT TIME ZONE 'Asia/Karachi','DD Mon YYYY HH24:MI:SS') AS timestamp
      FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
      WHERE ((a.entity='shop' AND a.entity_id=$1 AND a.action IN ('CREATE','UPDATE'))
        OR (a.details->>'shopId'=$1::text AND (a.action LIKE 'FIELD_%' OR a.action='RECORD_PAYMENT')))
      AND ($2::bigint IS NULL OR (a.user_id=$2 AND EXISTS(
        SELECT 1 FROM shops s WHERE s.id=$1 AND s.assigned_sales_id=$2)))
      ORDER BY a.id DESC LIMIT 50`,params),
  ]) : [[],[],[],[]];
  const due = invoices.filter(invoice => Number(invoice.due)>0);
  const openTotal = due.reduce((total, invoice) => total+Math.round(Number(invoice.due)*100),0)/100;
  const received = payments.find(payment => payment.id===selection.received);
  const today = pakistanToday();

  return <div className="sales-department">
    <div className="page-title-row"><div className="page-title"><h1>Field Sales</h1>
      <p>{owner === null ? 'Manage shop assignments, stock bookings, and collections.' : 'Register shops, book stock, and collect invoice payments.'}</p></div>
      <div className="actions">
        {owner===null && <Link className="btn" href="/field/access">Manage shop access</Link>}
        <Link className="btn primary" href={`/field?new=1${shop?'&shop='+shop.id:''}#register-shop`}><Store size={16}/> Register shop</Link>
      </div></div>

    {!shops.length && user.role==='FIELD_SALES' && <p className="notice">No shops are assigned to your account yet. You can register a shop for a manager to assign.</p>}

    {shops.length>0 && <form className="card inline-form" action="/field">
      <label className="field">Shop<select name="shop" defaultValue={shop?.id}>
        {shops.map(entry => <option key={entry.id} value={entry.id}>{entry.shop_name}</option>)}
      </select></label><button type="submit" className="btn primary">Open shop</button>
    </form>}

    <details id="register-shop" className="card section-gap" open={(!shops.length || selection.new==='1') || undefined}>
      <summary><strong>Register a new shop</strong></summary>
      <DepartmentForm action={saveFieldShop} submitLabel="Register shop"><ShopFields agents={agents}/></DepartmentForm>
    </details>

    {queue.length>0 && <section className="card section-gap">
      <div className="card-header"><div><h2>Pending dispatch queue</h2><p className="card-sub">Oldest bookings first across all active shops.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Shop</th><th>Booked by</th><th>Booked at</th><th>Action</th></tr></thead>
        <tbody>{queue.map(booking => <tr key={booking.id}><td>#{booking.id}</td>
          <td><Link href={'/field?shop='+booking.shop_id}>{booking.shop_name}</Link></td><td>{booking.seller}</td>
          <td>{booking.date} PKT</td><td><Link className="btn" href={'/sales/new?booking='+booking.id}>Review and dispatch</Link></td></tr>)}</tbody></table></div>
    </section>}

    {shop && <>
      <section className="card section-gap"><div className="card-header"><div><h2>{shop.shop_name}</h2>
        <p className="card-sub">Registered by {shop.registered_by || 'not recorded'} · Assigned seller {shop.seller || 'unassigned'}</p></div></div>
        {received && <div className="success-note">
          <p role="status">Payment {received.payment_no} recorded.</p>
          {received.invoice_id && <ShareFieldPdf key={'invoice-'+received.invoice_id} kind="invoice"
            id={String(received.invoice_id)} label="Share updated invoice"/>}
          <ShareFieldPdf key={'receipt-'+received.id} kind="receipt" id={String(received.id)}
            label={received.combined?'Share combined statement and receipt':'Share payment receipt'}/>
        </div>}
        <details><summary>Edit shop details{owner===null?' or seller assignment':''}</summary>
          <DepartmentForm key={shop.id} action={saveFieldShop} submitLabel="Save shop"><ShopFields shop={shop} agents={agents}/></DepartmentForm>
        </details>
      </section>

      <div className="columns equal section-gap">
        <section className="card">
          <div className="card-header"><div><h2><ClipboardList size={17}/> Book stock</h2><p className="card-sub">Bookings go to a manager for dispatch.</p></div></div>
          {products.length ? <DepartmentForm key={shop.id} action={bookFieldStock} submitLabel="Submit booking">
            <input type="hidden" name="shop_id" value={shop.id}/><FieldBookingLines products={products}/>
            <label className="field span-2">Notes<textarea name="note" maxLength={500}/></label><FieldLocation/>
          </DepartmentForm> : <p className="empty">There are no active products available to book.</p>}
        </section>
        <section className="card">
          <div className="card-header"><div><h2><Wallet size={17}/> Collect invoice payment</h2>
            <p className="card-sub">Choose one invoice or apply a payment across all open invoices, earliest due date first.</p></div></div>
          {due.length ? <DepartmentForm key={shop.id} action={collectFieldPayment} submitLabel="Record payment">
            <input type="hidden" name="shop_id" value={shop.id}/>
            <input type="hidden" name="submission_id" value={randomUUID()}/>
            <label className="field span-2">Apply payment to<select name="invoice_id" defaultValue={due.length===1?due[0].id:''} required>
              {due.length>1 && <>
                <option value="" disabled>Choose one invoice or all open invoices</option>
                <option value="all">All open invoices ({due.length}) · {money(openTotal)} due</option>
              </>}{due.map(invoice =>
              <option key={invoice.id} value={invoice.id}>{invoice.invoice_no} · {money(invoice.due)} due</option>
            )}</select></label>
            <label className="field">Amount (PKR)<input name="amount" type="number" min="0.01" step="0.01" required/></label>
            <label className="field">Payment date<input name="payment_date" type="date" defaultValue={today} max={today} required/></label>
            <label className="field">Method<select name="method">{['CASH','BANK','EASYPAISA','JAZZCASH','CHEQUE','OTHER'].map(method=>
              <option key={method} value={method}>{method}</option>)}</select></label>
            <label className="field">Reference<input name="reference" maxLength={120}/></label><FieldLocation/>
          </DepartmentForm> : <p className="empty">No unpaid invoices for this shop.</p>}
        </section>
      </div>

      <section className="card section-gap"><h2><BookOpen size={17}/> Stock bookings</h2>
        {!bookings.length ? <p className="empty">No bookings yet.</p> : <div className="table-wrap"><table><thead><tr>
          <th>Booking</th><th>Products</th><th>Booked by</th><th>Status</th><th>Actions</th>
        </tr></thead><tbody>{bookings.map(booking => <tr key={booking.id}>
          <td>#{booking.id}<br/><small>{booking.booked_at} PKT</small></td>
          <td>{booking.products?.join(', ') || 'Products unavailable'}{booking.note && <><br/><small>{booking.note}</small></>}</td>
          <td>{booking.seller}</td><td><span className={`badge ${booking.status==='PENDING'?'pending':booking.status==='CANCELLED'?'red':''}`}>{booking.status}</span></td>
          <td>{booking.invoice_id && <ShareFieldPdf kind="invoice" id={String(booking.invoice_id)}/>}
            {owner===null && booking.status==='PENDING' && <>
              <Link className="btn primary" href={'/sales/new?booking='+booking.id}>Dispatch booking</Link>
              <details className="section-gap"><summary>Cancel booking</summary>
                <DepartmentForm action={cancelFieldBooking} submitLabel="Confirm cancellation">
                  <input type="hidden" name="booking_id" value={booking.id}/>
                  <label className="field span-2">Reason<input name="reason" maxLength={300} required/></label>
                  <FieldLocation/>
                </DepartmentForm>
              </details>
            </>}</td>
        </tr>)}</tbody></table></div>}
      </section>

      <div className="columns equal section-gap">
        <section className="card"><div className="card-header"><h2>Invoices</h2>
          {due.length>1 && <ShareFieldPdf key={shop.id} kind="combined" id={shop.id} label="Share open invoices as one PDF"/>}
        </div>
          {!invoices.length ? <p className="empty">No invoices yet.</p> : <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Balance</th><th>Share</th></tr></thead>
            <tbody>{invoices.slice(0,30).map(invoice => <tr key={invoice.id}><td>{invoice.invoice_no}<br/><small>{invoice.issued}</small></td>
              <td>{money(invoice.due)}</td><td><ShareFieldPdf kind="invoice" id={String(invoice.id)}/></td></tr>)}</tbody></table></div>}
        </section>
        <section className="card"><h2>{owner===null?'Recent collections':'My recent collections'}</h2>
          {!payments.length ? <p className="empty">No collections recorded.</p> : <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Collected by</th><th>Amount</th><th>Share</th></tr></thead>
            <tbody>{payments.map(payment => <tr key={payment.id}><td>{payment.payment_no}<br/><small>{payment.date} · {payment.method}{payment.combined?' · Combined':''}</small></td>
              <td>{payment.collector || 'Not recorded'}</td><td>{money(payment.amount)}</td><td><ShareFieldPdf kind="receipt"
                id={String(payment.id)} label={payment.combined?'Share combined PDF':undefined}/></td></tr>)}</tbody></table></div>}
        </section>
      </div>

      <section className="card section-gap"><h2>{owner===null?'Shop activity history':'My shop activity'}</h2>
        {!activity.length ? <p className="empty">No recorded activity.</p> : <div className="table-wrap"><table><thead><tr>
          <th>Date and time</th><th>Action</th><th>Recorded by</th><th>Location</th>
        </tr></thead><tbody>{activity.map(event => {
          const location = event.details?.location as {latitude:number;longitude:number;accuracy:number}|undefined;
          const before = event.details?.before;
          const changes = event.details?.changes;
          const changed = before && changes ? Object.keys(changes).filter(key => String(before[key]??'')!==String(changes[key]??'')): [];
          return <tr key={event.id}><td>{event.timestamp} PKT</td><td>
            {actions[event.action] || event.action} · #{event.entity_id}
            {changed.length>0 && <details><summary>View changes</summary><ul>{changed.map(key =>
              <li key={key}>{key==='assigned_sales_id'?'Assigned seller':key.replaceAll('_',' ')} · {
                key==='assigned_sales_id'?(agents?.find(agent=>agent.id===String(before[key]))?.full_name ?? String(before[key]??'Unassigned')):String(before[key]??'—')
              } → {key==='assigned_sales_id'?(agents?.find(agent=>agent.id===String(changes[key]))?.full_name ?? String(changes[key]??'Unassigned')):String(changes[key]??'—')}</li>
            )}</ul></details>}
          </td><td>{event.actor || 'Not recorded'}</td><td>{location
            ? <><MapPin size={14} aria-hidden="true"/> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}<br/><small>±{Math.round(location.accuracy)} m</small></>
            : 'Not captured'}</td></tr>;
        })}</tbody></table></div>}
      </section>
    </>}
  </div>;
}
