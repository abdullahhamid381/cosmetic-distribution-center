import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {money} from '@/lib/utils';
import {stockReportId,warehouseMovementReport,warehouseStockReport,warehouseStockTotals} from '@/lib/warehouse-stock-report';

export const runtime='nodejs';

const stockColumns=[
 ['Warehouse','warehouse'],['Product','product'],['SKU','sku'],['Batch','batch_number'],
 ['Manufactured','manufacture_date'],['Expires','expiry_date'],['Units on hand','quantity_on_hand'],
 ['Unit cost (PKR)','unit_cost'],['Stock value (PKR)','stock_value'],['Status','status'],
];
const movementColumns=[
 ['Movement ID','id'],['Recorded (PKT)','recorded_at'],['Warehouse','warehouse'],['Product','product'],
 ['SKU','sku'],['Batch','batch_number'],['Movement type','movement_type'],['Quantity change','quantity_delta'],
 ['Reference type','reference_type'],['Reference ID','reference_id'],['Note','note'],['Recorded by','staff'],
];

function csvValue(value:unknown) {
 const text=String(value??'');
 const safe=typeof value==='string'&&/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text)?`'${text}`:text;
 return `"${safe.replaceAll('"','""')}"`;
}

export async function GET(request:Request) {
 const user=await requireRole('ADMIN','MANAGER','WAREHOUSE');
 const params=new URL(request.url).searchParams;
 const warehouse=stockReportId(params.get('warehouse')),product=stockReportId(params.get('product'));
 if(params.get('format')==='pdf') {
  const [stock,ledger,warehouses,products]=await Promise.all([
   warehouseStockReport(warehouse,product),warehouseMovementReport(warehouse,product),
   warehouse?query('SELECT name FROM warehouses WHERE id=$1',[warehouse]):[],
   product?query('SELECT name,sku FROM products WHERE id=$1',[product]):[],
  ]);
  const warehouseLabel=warehouse?(warehouses[0]?.name??`Warehouse #${warehouse}`):'All warehouses';
  const productLabel=product?(products[0]?`${products[0].name} (${products[0].sku})`:`Product #${product}`):'All products';
  const totals=warehouseStockTotals(stock);
  const now=new Date();
  const generated=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'}).format(now)+' PKT';
  const {reportPdf}=await import('@/lib/report-pdf');
  const bytes=await reportPdf({
   title:'Warehouse Stock Report',scope:`${warehouseLabel} / ${productLabel}`,
   period:'Current stock and movement history',generated,preparedBy:user.name,
   metrics:[
    {label:'Units on hand',value:totals.onHand.toLocaleString('en-PK')},
    {label:'Saleable units',value:totals.available.toLocaleString('en-PK')},
    {label:'On-hand value at batch cost',value:money(totals.value/100)},
   ],
   notes:[],
   tables:[
    {title:'Batch balances',headers:stockColumns.map(([label])=>label),
     widths:[11,15,8,9,9,9,8,9,12,10],
     rows:stock.map(row=>stockColumns.map(([,key])=>String(row[key]??'—')))},
    {title:'Stock movements',headers:['ID / Recorded (PKT)','Warehouse','Product / SKU','Batch','Type / Reference','Change','Note','Recorded by'],
     widths:[14,11,16,9,16,7,17,10],
     rows:ledger.map(row=>[
      `#${row.id}\n${row.recorded_at}`,row.warehouse,`${row.product}\n${row.sku}`,row.batch_number,
      [row.movement_type,[row.reference_type,row.reference_id].filter(Boolean).join(' ')].filter(Boolean).join('\n'),
      String(row.quantity_delta),row.note||'—',row.staff||'System',
     ])},
   ],
  });
  return new Response(new Uint8Array(bytes),{headers:{
   'Content-Type':'application/pdf',
   'Content-Disposition':'attachment; filename="warehouse-stock-report.pdf"',
   'Cache-Control':'private, no-store',
  }});
 }
 const movements=params.get('view')==='movements';
 const columns=movements?movementColumns:stockColumns;
 const rows=await (movements?warehouseMovementReport(warehouse,product):warehouseStockReport(warehouse,product));
 const csv=[columns.map(([label])=>csvValue(label)).join(','),
  ...rows.map(row=>columns.map(([,key])=>csvValue(row[key])).join(','))].join('\r\n');
 return new Response('\uFEFF'+csv,{headers:{
  'Content-Type':'text/csv; charset=utf-8',
  'Content-Disposition':`attachment; filename="warehouse-${movements?'movements':'stock'}.csv"`,
  'Cache-Control':'private, no-store',
 }});
}
