import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {businessReport,reportFilters} from '@/lib/report-data';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function csvValue(v:unknown){
  const text=v==null?'':String(v);
  // Prevent spreadsheet programs executing untrusted shop/product names as formulas.
  const safe=/^[=+\-@\t\r]/.test(text)?"'"+text:text;
  return '"'+safe.replaceAll('"','""')+'"';
}
export async function GET(request:NextRequest){
 await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const kind=request.nextUrl.searchParams.get('kind');
 if(kind==='report') {
  const filters=reportFilters({shop:request.nextUrl.searchParams.get('shop')||'',from:request.nextUrl.searchParams.get('from')||'',to:request.nextUrl.searchParams.get('to')||''});
  if(filters.error)return NextResponse.json({error:filters.error},{status:400});
  const data=await businessReport(filters);
  const headers=['Invoice','Store','Phone','Issue date','Due date','Shop discount %','Original amount','Received payment','Return credits','Remaining payment','Delivery','Status'];
  const body=[headers.map(csvValue).join(','),...data.invoices.map(i=>[i.invoice_no,i.shop_name,i.phone,i.issue_date,i.due_date,i.shop_discount_percentage,i.total,i.paid_total,i.credit_total,i.remaining,i.delivery_no,i.overdue?'Overdue':Number(i.remaining)?'Payment pending':'Settled'].map(csvValue).join(','))].join('\r\n');
  return new NextResponse('\uFEFF'+body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="hh-medics-filtered-invoices.csv"','Cache-Control':'private, no-store'}});
 }
 const sources: Record<string,{headers:string[];sql:string}>={
  shops:{headers:['Shop','City','Contact','Phone','Discount Percent','Invoiced','Payments','Return Credits','Outstanding'],sql:`SELECT s.shop_name,s.city,s.contact_name,s.phone,s.default_discount,COALESCE(SUM(i.total),0) AS invoiced,COALESCE(SUM(i.paid_total),0) AS paid,COALESCE(SUM(i.credit_total),0) AS credits,COALESCE(SUM(i.total-i.paid_total-i.credit_total),0) AS outstanding FROM shops s LEFT JOIN invoices i ON i.shop_id=s.id GROUP BY s.id ORDER BY s.shop_name`},
  inventory:{headers:['Warehouse','SKU','Product','Batch','Manufactured','Expiry','On Hand','Unit Cost'],sql:`SELECT w.name AS warehouse,p.sku,p.name AS product,b.batch_number,b.manufacture_date,b.expiry_date,b.quantity_on_hand,b.unit_cost FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id ORDER BY w.name,p.name,b.batch_number`},
  invoices:{headers:['Invoice','Shop','Issue Date','Due Date','Subtotal','Discount','Invoiced','Received','Credits','Open Balance'],sql:`SELECT i.invoice_no,s.shop_name,i.issue_date,i.due_date,i.subtotal,i.discount_total,i.total,i.paid_total,i.credit_total,(i.total-i.paid_total-i.credit_total) AS outstanding FROM invoices i JOIN shops s ON s.id=i.shop_id ORDER BY i.id DESC`}
 };
 if(!kind || !(kind in sources))return NextResponse.json({error:'Unknown report type'},{status:400});
 const src=sources[kind];const rows=await query(src.sql);
 const body=[src.headers.map(csvValue).join(','),...rows.map(r=>Object.values(r).map(v=>csvValue(v instanceof Date?v.toISOString().slice(0,10):v)).join(','))].join('\r\n');
 return new NextResponse('\uFEFF'+body,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="cdc-${kind}-${new Date().toISOString().slice(0,10)}.csv"`,'Cache-Control':'private, no-store'}});
}
