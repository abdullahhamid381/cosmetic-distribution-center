import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {fieldOwner, type FieldCollectionLine} from '@/lib/field-sales';
import {money} from '@/lib/utils';
import {reportPdf} from '@/lib/report-pdf';
import type {ReportDocument} from '@/lib/report-document';
import {pakistanToday} from '@/lib/closing-period';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_:Request,{params}:{params:Promise<{kind:string;id:string}>}) {
  const user = await currentUser();
  if (!user) return new Response(null,{status:401});
  if (!['ADMIN','MANAGER','SALES','FIELD_SALES','ACCOUNTS'].includes(user.role)) return new Response(null,{status:403});
  const {kind,id} = await params;
  if (!['invoice','receipt','combined'].includes(kind)||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1) {
    return new Response(null,{status:404});
  }
  const owner = fieldOwner(user);
  const document = await transaction(async tx => {
    // Keep authorization, totals and line items on the same database snapshot.
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    if (kind==='combined') {
      const {rows:[shop]}=await tx.query(`SELECT shop_name FROM shops WHERE id=$1 AND active
        AND ($2::bigint IS NULL OR assigned_sales_id=$2)`,[id,owner]);
      if (!shop) return null;
      const {rows:invoices}=await tx.query(`SELECT invoice_no, due_date::text AS due_date,
        total,paid_total,credit_total,total-paid_total-credit_total AS balance_due
        FROM invoices WHERE shop_id=$1 AND total>paid_total+credit_total ORDER BY due_date,id`,[id]);
      if (!invoices.length) return null;
      const balance=invoices.reduce((sum,invoice)=>sum+Math.round(Number(invoice.balance_due)*100),0)/100;
      return {
        title:'Combined open invoice statement',scope:shop.shop_name,period:pakistanToday(),generated:pakistanToday(),preparedBy:'',
        metrics:[{label:'Open invoices',value:String(invoices.length)},{label:'Total outstanding',value:money(balance)}],
        notes:['This statement consolidates existing invoices for payment. Each invoice retains its original number.'],
        tables:[{title:'Open invoices',headers:['Invoice','Due date','Invoice total','Paid','Credits','Balance due'],widths:[22,16,17,15,14,16],
          rows:invoices.map(i=>[i.invoice_no,i.due_date,money(i.total),money(i.paid_total),money(i.credit_total),money(i.balance_due)])}],
      } satisfies ReportDocument;
    }
    let document: ReportDocument;
    if (kind==='invoice') {
      const {rows:[invoice]} = await tx.query(`SELECT i.invoice_no,i.total,i.paid_total,i.credit_total,
        to_char(i.issue_date,'DD Mon YYYY') AS date,to_char(i.due_date,'DD Mon YYYY') AS due_date,s.shop_name
        FROM invoices i JOIN shops s ON s.id=i.shop_id WHERE i.id=$1
        AND ($2::bigint IS NULL OR (s.active AND s.assigned_sales_id=$2))`,[id,owner]);
      if (!invoice) return null;
      const {rows:items} = await tx.query(`SELECT p.name,ii.quantity,ii.applied_unit_price,ii.line_total
        FROM invoice_items ii JOIN products p ON p.id=ii.product_id WHERE ii.invoice_id=$1 ORDER BY ii.id`,[id]);
      document = {title:'Sales invoice '+invoice.invoice_no,scope:invoice.shop_name,period:invoice.date,generated:pakistanToday(),preparedBy:'',
        metrics:[{label:'Invoice total',value:money(invoice.total)},{label:'Paid',value:money(invoice.paid_total)},
          {label:'Balance due',value:money(Number(invoice.total)-Number(invoice.paid_total)-Number(invoice.credit_total))}],
        notes:['Payment due '+invoice.due_date,'Return credits '+money(invoice.credit_total)],
        tables:[{title:'Invoice items',headers:['Product','Quantity','Unit price','Total'],widths:[49,11,20,20],
          rows:items.map(item=>[item.name,String(item.quantity),money(item.applied_unit_price),money(item.line_total)])}]};
    } else {
      const {rows:[payment]} = await tx.query(`SELECT p.payment_no,p.amount,p.method,p.reference,
        to_char(p.payment_date,'DD Mon YYYY') AS date,s.shop_name,u.full_name AS collector,
        entry.details->'combinedInvoices' AS combined_invoices
        FROM payments p JOIN shops s ON s.id=p.shop_id LEFT JOIN users u ON u.id=p.created_by
        LEFT JOIN LATERAL (
          SELECT details FROM audit_logs WHERE entity='payment' AND entity_id=p.id AND action='FIELD_COLLECT_PAYMENT'
          ORDER BY id DESC LIMIT 1
        ) entry ON p.field_submission_id IS NOT NULL
        WHERE p.id=$1 AND ($2::bigint IS NULL OR (s.active AND s.assigned_sales_id=$2 AND p.created_by=$2))`,[id,owner]);
      if (!payment) return null;
      const combined=payment.combined_invoices as FieldCollectionLine[]|null;
      const receiptNotes=[payment.collector&&'Collected by '+payment.collector,payment.reference&&'Reference '+payment.reference].filter(Boolean);
      if (combined?.length) {
        const balances=combined.reduce((sum,line)=>({
          before:sum.before+line.balanceBeforeCents,after:sum.after+line.balanceAfterCents,
        }),{before:0,after:0});
        return {
          title:'Combined invoice statement and receipt',scope:payment.shop_name,period:payment.date,generated:pakistanToday(),preparedBy:'',
          metrics:[{label:'Balance before payment',value:money(balances.before/100)},
            {label:'Payment received',value:money(payment.amount)},{label:'Balance immediately after payment',value:money(balances.after/100)}],
          notes:[`Receipt ${payment.payment_no} · ${payment.method}`,...receiptNotes,
            'Balances shown are from the time this payment was recorded.'],
          tables:[{title:'Payment allocation by invoice',headers:['Invoice','Due date','Previous balance','Payment applied','Remaining balance'],
            widths:[23,17,20,20,20],rows:combined.map(line=>[line.number,line.dueDate,money(line.balanceBeforeCents/100),
              money(line.appliedCents/100),money(line.balanceAfterCents/100)])}],
        } satisfies ReportDocument;
      }
      const {rows:allocations} = await tx.query(`SELECT i.invoice_no,a.amount FROM payment_allocations a
        JOIN invoices i ON i.id=a.invoice_id WHERE a.payment_id=$1 ORDER BY i.id`,[id]);
      document = {title:'Payment receipt '+payment.payment_no,scope:payment.shop_name,period:payment.date,generated:pakistanToday(),preparedBy:'',
        metrics:[{label:'Payment received',value:money(payment.amount)},{label:'Method',value:payment.method}],
        notes:receiptNotes,
        tables:[{title:'Applied to invoices',headers:['Invoice','Amount'],widths:[70,30],
          rows:allocations.map(allocation=>[allocation.invoice_no,money(allocation.amount)])}]};
    }
    return document;
  });
  if (!document) return new Response(null,{status:404});
  const bytes = await reportPdf(document,{customerCopy:true});
  return new NextResponse(new Uint8Array(bytes),{headers:{
    'Content-Type':'application/pdf',
    'Content-Disposition':`attachment; filename="hh-medics-${kind}-${id}.pdf"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  }});
}
