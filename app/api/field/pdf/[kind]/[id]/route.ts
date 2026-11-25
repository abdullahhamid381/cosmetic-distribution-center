import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {fieldOwner, type FieldCollectionLine} from '@/lib/field-sales';
import {money} from '@/lib/utils';
import {reportPdf} from '@/lib/report-pdf';
import type {ReportDocument, ReportTable} from '@/lib/report-document';
import {pakistanToday} from '@/lib/closing-period';
import {invoiceSlipCode, invoiceSlipNumberSql} from '@/lib/invoice-dates';
import {invoiceBarcode} from '@/lib/invoice-barcode';
import type {PoolClient} from 'pg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FieldPdfDocument = ReportDocument & {storeCode:string};

async function invoiceDetails(tx: PoolClient, shopId: string, ids: string[],
  legacyNumbers: string[] = [], recordedAt: Date|null = null): Promise<ReportTable[]> {
  if (!ids.length && !legacyNumbers.length) return [];
  const {rows:invoices} = await tx.query(`SELECT i.id,i.invoice_no,i.subtotal,i.discount_total,i.total,
    i.paid_total,i.credit_total,i.total-i.paid_total-i.credit_total AS balance,
    i.issue_date::text AS issue_date,i.due_date::text AS due_date,${invoiceSlipNumberSql} AS slip_number,
    items.lines
    FROM invoices i LEFT JOIN deliveries d ON d.id=i.delivery_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'name',p.name,'batch',b.batch_number,'qty',ii.quantity,'mrp',ii.retail_unit_price,
        'first',COALESCE(ii.first_discount_pct,ii.discount_pct),'second',COALESCE(ii.second_discount_pct,0),
        'price',ii.applied_unit_price,'total',ii.line_total
      ) ORDER BY ii.id) AS lines
      FROM invoice_items ii JOIN products p ON p.id=ii.product_id LEFT JOIN batches b ON b.id=ii.batch_id
      WHERE ii.invoice_id=i.id
    ) items ON true
    WHERE i.shop_id=$1 AND (i.id=ANY($2::bigint[]) OR (i.invoice_no=ANY($3::text[]) AND i.created_at <= $4::timestamptz))
    ORDER BY i.due_date,i.id`,[shopId,ids,legacyNumbers,recordedAt]);
  const percent = (value:unknown) => Number(value ?? 0).toFixed(2)+'%';
  const price = (value:number|string) => money(value).slice(4);
  return invoices.map(invoice=>({
    title:'Invoice '+(invoice.invoice_no || '#'+invoice.id),
    barcode:invoiceBarcode(invoiceSlipCode(invoice.issue_date,invoice.slip_number),Number(invoice.id)),
    note:`Issued ${invoice.issue_date}  ·  Due ${invoice.due_date}`,
    invoiceTotals:{
      subtotal:money(invoice.subtotal),discount:money(invoice.discount_total),total:money(invoice.total),
      paid:money(invoice.paid_total),credits:money(invoice.credit_total),balance:money(invoice.balance),
    },
    headers:['Product / Batch','Qty','MRP (PKR)','1st disc.','2nd disc.','Unit price (PKR)','Total (PKR)'],
    widths:[31,8,12,10,10,14,15],
    rows:(invoice.lines??[]).map((line:{name:string;batch:string|null;qty:number;mrp:number;first:number;second:number;price:number;total:number})=>[
      line.batch?`${line.name}\nBatch: ${line.batch}`:line.name,String(line.qty),price(line.mrp),percent(line.first),
      percent(line.second),price(line.price),price(line.total),
    ]),
  }));
}

export async function GET(_:Request,{params}:{params:Promise<{kind:string;id:string}>}) {
  const user = await currentUser();
  if (!user) return new Response(null,{status:401});
  if (!['ADMIN','MANAGER','SALES','FIELD_SALES','ACCOUNTS'].includes(user.role)) return new Response(null,{status:403});
  const {kind,id} = await params;
  if (!['invoice','receipt','combined'].includes(kind)||!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1) {
    return new Response(null,{status:404});
  }
  const owner = fieldOwner(user);
  const generated = pakistanToday();
  const document = await transaction(async tx => {
    // Keep authorization, totals and line items on the same database snapshot.
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    if (kind==='combined') {
      const {rows:[shop]}=await tx.query(`SELECT shop_name,store_code FROM shops WHERE id=$1 AND active
        AND ($2::bigint IS NULL OR assigned_sales_id=$2)`,[id,owner]);
      if (!shop) return null;
      const {rows:invoices}=await tx.query(`SELECT invoice_no, due_date::text AS due_date,
        subtotal,discount_total,total,paid_total,credit_total,total-paid_total-credit_total AS balance_due
        FROM invoices WHERE shop_id=$1 AND total>paid_total+credit_total ORDER BY due_date,id`,[id]);
      if (!invoices.length) return null;
      const balance=invoices.reduce((sum,invoice)=>sum+Math.round(Number(invoice.balance_due)*100),0)/100;
      return {
        title:'Combined open invoice statement',scope:shop.shop_name,period:generated,generated,preparedBy:'',
        storeCode:shop.store_code,
        metrics:[{label:'Open invoices',value:String(invoices.length)},{label:'Total outstanding',value:money(balance)}],
        notes:['This statement consolidates existing invoices for payment. Each invoice retains its original number.'],
        tables:[{title:'Open invoices',headers:['Invoice','Due date','Subtotal','Total discount','Invoice total','Paid','Credits','Balance due'],
          widths:[16,13,12,11,13,11,10,14],
          rows:invoices.map(i=>[i.invoice_no,i.due_date,money(i.subtotal),money(i.discount_total),money(i.total),
            money(i.paid_total),money(i.credit_total),money(i.balance_due)])}],
      } satisfies FieldPdfDocument;
    }
    let document: FieldPdfDocument;
    if (kind==='invoice') {
      const {rows:[invoice]} = await tx.query(`SELECT i.shop_id,i.invoice_no,i.total,i.paid_total,i.credit_total,
        to_char(i.issue_date,'DD Mon YYYY') AS date,to_char(i.due_date,'DD Mon YYYY') AS due_date,s.shop_name,s.store_code
        FROM invoices i JOIN shops s ON s.id=i.shop_id WHERE i.id=$1
        AND ($2::bigint IS NULL OR (s.active AND s.assigned_sales_id=$2))`,[id,owner]);
      if (!invoice) return null;
      document = {title:'Sales invoice '+invoice.invoice_no,scope:invoice.shop_name,period:invoice.date,generated,preparedBy:'',
        storeCode:invoice.store_code,
        metrics:[{label:'Invoice total',value:money(invoice.total)},{label:'Paid',value:money(invoice.paid_total)},
          {label:'Balance due',value:money(Number(invoice.total)-Number(invoice.paid_total)-Number(invoice.credit_total))}],
        notes:['Payment due '+invoice.due_date,'Return credits '+money(invoice.credit_total)],
        tables:await invoiceDetails(tx,invoice.shop_id,[id])};
    } else {
      const {rows:[payment]} = await tx.query(`SELECT p.payment_no,p.shop_id,p.created_at,p.amount,p.method,p.reference,
        to_char(p.payment_date,'DD Mon YYYY') AS date,s.shop_name,s.store_code,u.full_name AS collector,
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
          title:'Combined invoice statement and receipt',scope:payment.shop_name,period:payment.date,generated,preparedBy:'',
          storeCode:payment.store_code,
          metrics:[{label:'Balance before payment',value:money(balances.before/100)},
            {label:'Payment received',value:money(payment.amount)},{label:'Balance immediately after payment',value:money(balances.after/100)}],
          notes:[`Receipt ${payment.payment_no} · ${payment.method}`,...receiptNotes,
            'The receipt table shows balances at collection. The invoice details below show current balances.'],
          tables:[{title:'Payment allocation by invoice',headers:['Invoice','Due date','Previous balance','Payment applied','Remaining balance'],
            widths:[23,17,20,20,20],rows:combined.map(line=>[line.number,line.dueDate,money(line.balanceBeforeCents/100),
              money(line.appliedCents/100),money(line.balanceAfterCents/100)])},
            ...await invoiceDetails(tx,payment.shop_id,combined.flatMap(line=>line.invoiceId?[line.invoiceId]:[]),
              combined.filter(line=>!line.invoiceId).map(line=>line.number),payment.created_at)],
        } satisfies FieldPdfDocument;
      }
      const {rows:allocations} = await tx.query(`SELECT i.id,i.invoice_no,a.amount FROM payment_allocations a
        JOIN invoices i ON i.id=a.invoice_id WHERE a.payment_id=$1 ORDER BY i.id`,[id]);
      document = {title:'Payment receipt '+payment.payment_no,scope:payment.shop_name,period:payment.date,generated,preparedBy:'',
        storeCode:payment.store_code,
        metrics:[{label:'Payment received',value:money(payment.amount)},{label:'Method',value:payment.method}],
        notes:receiptNotes,
        tables:[{title:'Applied to invoices',headers:['Invoice','Amount'],widths:[70,30],
          rows:allocations.map(allocation=>[allocation.invoice_no,money(allocation.amount)])},
          ...await invoiceDetails(tx,payment.shop_id,allocations.map(allocation=>String(allocation.id)))]};
    }
    return document;
  });
  if (!document) return new Response(null,{status:404});
  const bytes = await reportPdf(document,{customerCopy:true,portrait:true});
  const code = document.storeCode.replace(/[^A-Za-z0-9_-]+/g,'-');
  return new NextResponse(new Uint8Array(bytes),{headers:{
    'Content-Type':'application/pdf',
    'Content-Disposition':`attachment; filename="${code}-${generated}.pdf"`,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
  }});
}
