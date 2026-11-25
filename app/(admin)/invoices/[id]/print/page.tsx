import {InvoicePaymentNotice} from '@/components/InvoicePaymentNotice';
import {InvoicePrintSlot} from '@/components/InvoicePrintSlot';
import {InvoiceBarcode} from '@/components/InvoiceBarcode';
import './invoice-print.css';

import {BrandLogo} from '@/components/BrandLogo';
import {invoiceSlipCode,invoiceSlipNumberSql} from '@/lib/invoice-dates';
import {bankSettings} from '@/lib/bank-settings';
import {BankDetails} from '@/components/BankDetails';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {cents,formatDate,money} from '@/lib/utils';
import {PrintButton} from '@/components/PrintButton';

const lineAmount = new Intl.NumberFormat('en-PK', {minimumFractionDigits: 2, maximumFractionDigits: 2});
type PreviousInvoice = {id: string; invoice_no: string; issue_date: string; balance: string};

export default async function PrintInvoice({params,searchParams}:{
 params:Promise<{id:string}>;
 searchParams:Promise<{mode?:string; selection?:string; include?:string|string[]}>;
}){await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const {id}=await params;const n=Number(id);if(!Number.isSafeInteger(n)||n<1)notFound();
 const {mode,selection,include}=await searchParams;
 const [rows,items,payments]=await Promise.all([
 query(`SELECT i.*,to_char(i.issue_date,'YYYY-MM-DD') AS issue_date,to_char(i.due_date,'YYYY-MM-DD') AS due_date,
   s.shop_name,s.store_code,s.contact_name,s.phone,s.address,s.city,d.delivery_no,${invoiceSlipNumberSql} AS slip_number,
   to_char(d.created_at AT TIME ZONE 'Asia/Karachi','DD/MM/YYYY') AS dispatch_date,
   to_char(d.delivered_at AT TIME ZONE 'Asia/Karachi','DD/MM/YYYY') AS received_date,
   i.total-i.paid_total-i.credit_total AS outstanding,
   previous.invoices AS previous_invoices
   FROM invoices i JOIN shops s ON s.id=i.shop_id LEFT JOIN deliveries d ON d.id=i.delivery_id
   LEFT JOIN LATERAL (
     SELECT jsonb_agg(jsonb_build_object(
       'id', p.id::text, 'invoice_no', p.invoice_no,
       'issue_date', to_char(p.issue_date,'YYYY-MM-DD'),
       'balance', (p.total-p.paid_total-p.credit_total)::text
     ) ORDER BY p.created_at,p.id) AS invoices
     FROM invoices p
     WHERE p.shop_id=i.shop_id
       AND (p.created_at,p.id)<(i.created_at,i.id)
       AND p.total>p.paid_total+p.credit_total
   ) previous ON true
   WHERE i.id=$1`,[n]),
 query(`SELECT ii.*,p.name AS product_name,b.batch_number
   FROM invoice_items ii JOIN products p ON p.id=ii.product_id JOIN batches b ON b.id=ii.batch_id
   WHERE ii.invoice_id=$1 ORDER BY ii.id`,[n]),
 query(`SELECT a.id,to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,a.amount
   FROM payment_allocations a JOIN payments p ON p.id=a.payment_id
   WHERE a.invoice_id=$1 ORDER BY p.payment_date,a.id`,[n])]);
 const inv=rows[0];if(!inv)notFound();
 const slipCode=invoiceSlipCode(inv.issue_date,inv.slip_number);
 const bank=await bankSettings();
 const iban=bank.iban.replace(/\s/g,'').toUpperCase();
 const ublIban=/^PK\d{2}UNIL[A-Z0-9]{16}$/.test(iban)?iban:null;
 const settlementBank=ublIban?{...bank,bankName:'',accountTitle:'',iban:''}:bank;
 const outstanding=Number(inv.outstanding);
 const previousInvoices: PreviousInvoice[]=inv.previous_invoices??[];
 const combined=mode==='combined'&&previousInvoices.length>0;
 const includedIds=new Set(typeof include==='string'?[include]:include);
 const selectedInvoices=selection==='custom'
   ? previousInvoices.filter(previous=>includedIds.has(previous.id))
   : previousInvoices;
 const showPriorBalances=combined&&selectedInvoices.length>0;
 const previousBalanceCents=selectedInvoices.reduce((sum,previous)=>sum+cents(Number(previous.balance)),0);
 const printPath=`/invoices/${n}/print`;
 const hasSettlementDetails=payments.length>0||outstanding>0||Object.values(settlementBank).some(value=>value.trim());
 return <div className="legal-invoice-print"><div className="print-actions no-print">
  <Link className="btn" href={`/invoices/${n}`}>Back to invoice</Link>
  {previousInvoices.length>0&&<>
   <Link className="btn" href={printPath} aria-current={combined?undefined:'page'}>Separate invoice</Link>
   <Link className="btn" href={`${printPath}?mode=combined`} aria-current={combined?'page':undefined}>Combined invoice</Link>
  </>}
  <PrintButton/>
 </div>
 <p className="invoice-paper-size no-print">Paper size <strong>Folio (8.5 × 13 in), portrait</strong></p>
 {combined&&<form action={printPath} method="get" className="invoice-previous-print no-print">
  <input type="hidden" name="mode" value="combined"/>
  <input type="hidden" name="selection" value="custom"/>
  <fieldset key={JSON.stringify(selectedInvoices.map(previous=>previous.id))}>
   <legend>Previous invoices to include</legend>
   <p>The current invoice is always included. Apply your selection to update the print preview.</p>
   {previousInvoices.map(previous=><label key={previous.id}>
    <input type="checkbox" name="include" value={previous.id}
     defaultChecked={selection!=='custom'||includedIds.has(previous.id)}/>
    <span>{previous.invoice_no} · {money(previous.balance)} due</span>
   </label>)}
   <button type="submit" className="btn">Apply selection</button>
  </fieldset>
 </form>}
 {!combined&&previousInvoices.length>0&&<div className="invoice-previous-print no-print">
  <strong>Print a previous invoice separately</strong>
  <ul>{previousInvoices.map(previous=><li key={previous.id}>
   <Link href={`/invoices/${previous.id}/print`}>{previous.invoice_no} · {money(previous.balance)} due</Link>
  </li>)}</ul>
 </div>}<div className="legal-invoice-sheet"><div className="legal-invoice-copies">{['Office copy','Shop copy'].map(copy=><InvoicePrintSlot key={copy} footer={<div><div className="invoice-signatures"><div>Receiver signature</div><div>Authorized signature</div></div></div>}><article className="invoice-slip"><div className="invoice-head"><div className="invoice-brand"><BrandLogo className="document-brand-logo"/>{process.env.BUSINESS_PHONE&&<p className="invoice-brand-phone">{process.env.BUSINESS_PHONE}</p>}{ublIban&&<div className="invoice-online-payment"><span className="invoice-payment-heading">Online bank transfer</span><dl className="invoice-payment-fields"><div><dt>Bank:</dt><dd>UBL</dd></div><div><dt>Account title:</dt><dd>HH Cosmetics</dd></div><div className="invoice-payment-iban"><dt>IBAN:</dt><dd>{ublIban}</dd></div></dl></div>}</div><div className="invoice-reference" style={{textAlign:'right'}}><h1>{combined?'SALES INVOICE WITH PRIOR BALANCES':'SALES INVOICE'}</h1><span className="invoice-copy-label">{copy}</span><div><b>{inv.invoice_no}</b></div><div className="muted">Delivery {inv.delivery_no}</div><div>Slip code <b>{slipCode}</b></div></div><InvoiceBarcode invoiceNumber={slipCode} invoiceId={n}/></div>
 <div className="invoice-summary"><div><span className="eyebrow">BILL TO</span><h2>{inv.shop_name}</h2><div>Store code: <b>{inv.store_code}</b></div><p>{inv.contact_name}<br/>{[inv.address,inv.city].filter(Boolean).join(', ')}<br/>{inv.phone}</p></div><div><span className="eyebrow">DOCUMENT DETAILS</span><p>Invoice Date: <b>{formatDate(inv.issue_date)}</b><br/>Due Date: <b>{formatDate(inv.due_date)}</b><br/>{copy==='Office copy'?<>Stock dispatch date: <b>{inv.dispatch_date || 'Not recorded'}</b></>:<>Stock received date: {inv.received_date?<b>{inv.received_date}</b>:<span className="invoice-stock-date-line"/>}</>}<br/>Status: <b>{outstanding<=0?'SETTLED':'PAYMENT PENDING'}</b></p></div></div>
 <table className="invoice-line-items" aria-label="Invoice items in Pakistani rupees"><thead><tr><th>Product</th><th>Qty</th><th>MRP (Rs.)</th><th>1st Disc. %</th><th>2nd Disc. %</th><th>Unit price (Rs.)</th><th className="align-right">Total (Rs.)</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td><b>{i.product_name}</b><small className="invoice-item-batch">{/^batch\b/i.test(i.batch_number) ? i.batch_number : `Batch: ${i.batch_number}`}</small></td><td>{i.quantity}</td><td>{lineAmount.format(Number(i.retail_unit_price))}</td><td>{Number(i.first_discount_pct??i.discount_pct).toFixed(2)}%</td><td>{Number(i.second_discount_pct??0).toFixed(2)}%</td><td>{lineAmount.format(Number(i.applied_unit_price))}</td><td className="align-right">{lineAmount.format(Number(i.line_total))}</td></tr>)}</tbody></table>
 <div className={hasSettlementDetails?"invoice-slip-settlement has-details":"invoice-slip-settlement"}>{hasSettlementDetails&&<div className="invoice-settlement-details">
  
  <BankDetails bank={settlementBank} compact/>
  {payments.length>0&&<section className="invoice-payment-history"><h2>Payment history</h2><table>
   <thead><tr><th scope="col">Date received</th><th scope="col">Amount</th></tr></thead>
   <tbody>{payments.map(payment=><tr key={payment.id}><td>{formatDate(payment.payment_date)}</td><td>{money(payment.amount)}</td></tr>)}</tbody>
  </table></section>}
  {outstanding>0&&<InvoicePaymentNotice dueDate={formatDate(inv.due_date)}/>}
 </div>}<div className="invoice-total"><div><span>Retail Subtotal</span><b>{money(inv.subtotal)}</b></div><div><span>Discount</span><b>− {money(inv.discount_total)}</b></div><div className="final"><span>NET INVOICE</span><b>{money(inv.total)}</b></div><div><span>Total paid</span><b>{money(inv.paid_total)}</b></div><div><span>Return Credits</span><b>{money(inv.credit_total)}</b></div><div className="final"><span>BALANCE DUE</span><b>{money(outstanding)}</b></div></div></div>
 
 {showPriorBalances&&<section className="invoice-prior-balances">
  <h2>Previous unpaid invoices</h2>
  <table>
   <thead><tr><th scope="col">Invoice</th><th scope="col">Issued</th><th scope="col">Balance due</th></tr></thead>
   <tbody>{selectedInvoices.map(previous=><tr key={previous.id}>
    <td>{previous.invoice_no}</td><td>{formatDate(previous.issue_date)}</td><td>{money(previous.balance)}</td>
   </tr>)}</tbody>
  </table>
  <div className="invoice-total">
   <div><span>Previous balance due</span><b>{money(previousBalanceCents/100)}</b></div>
   <div><span>Current invoice balance due</span><b>{money(inv.outstanding)}</b></div>
   <div className="final"><span>COMBINED BALANCE DUE</span><b>{money((previousBalanceCents+cents(outstanding))/100)}</b></div>
  </div>
 </section>}
 {inv.note&&<p><b>Notes:</b> {inv.note}</p>}</article></InvoicePrintSlot>)}</div></div></div>;
}
