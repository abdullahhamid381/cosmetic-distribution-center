import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {money} from '@/lib/utils';
import {stockReportId,warehouseMovementReport,warehouseStockReport,warehouseStockTotals} from '@/lib/warehouse-stock-report';

export default async function WarehouseReport({searchParams}:{searchParams:Promise<{warehouse?:string;product?:string}>}) {
 await requireRole('ADMIN','MANAGER','WAREHOUSE');
 const params=await searchParams;
 const warehouse=stockReportId(params.warehouse),product=stockReportId(params.product);
 const [stock,movements,warehouses,products]=await Promise.all([
  warehouseStockReport(warehouse,product),warehouseMovementReport(warehouse,product,50),
  query('SELECT id,name FROM warehouses ORDER BY name'),query('SELECT id,name,sku FROM products ORDER BY name,sku,id'),
 ]);
 const totals=warehouseStockTotals(stock);
 const download=(format:string,view:string)=>'/api/reports/warehouse?'+new URLSearchParams({warehouse,product,view,format});
 return <>
  <div className="page-title-row"><div className="page-title"><h1>Warehouse Stock Report</h1><p>Current batch balances, inventory value at batch cost and stock movement history.</p></div><Link className="btn" href="/inventory">Back to inventory</Link></div>
  <form action="/inventory/report" className="card form-grid">
   <div className="field"><label htmlFor="report-warehouse">Warehouse</label><select id="report-warehouse" name="warehouse" defaultValue={warehouse}>
    <option value="">All warehouses</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
   </select></div>
   <div className="field"><label htmlFor="report-product">Product</label><select id="report-product" name="product" defaultValue={product}>
    <option value="">All products</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
   </select></div>
   <div className="form-actions"><button className="btn primary" type="submit">Apply filters</button>
    <a className="btn outline" href={download('pdf','report')}>Download PDF</a>
    <a className="btn outline" href={download('csv','stock')}>Download stock CSV</a>
    <a className="btn outline" href={download('csv','movements')}>Download movement CSV</a>
   </div>
  </form>
  <div className="stats-grid section-gap">
   <div className="card stat"><div className="stat-top">Units on hand</div><strong>{totals.onHand.toLocaleString()}</strong></div>
   <div className="card stat"><div className="stat-top">Saleable units</div><strong>{totals.available.toLocaleString()}</strong></div>
   <div className="card stat"><div className="stat-top">On-hand value at batch cost</div><strong>{money(totals.value/100)}</strong></div>
  </div>
  <div className="card section-gap"><h2>Batch balances</h2><div className="table-wrap"><table>
   <thead><tr><th>Warehouse</th><th>Product / SKU</th><th>Batch</th><th>Manufactured</th><th>Expires</th><th>Units on hand</th><th>Unit cost</th><th>Stock value</th><th>Status</th></tr></thead>
   <tbody>{stock.map(row=><tr key={row.id}><td>{row.warehouse}</td><td>{row.product}<div className="muted">{row.sku}</div></td>
    <td>{row.batch_number}</td><td>{row.manufacture_date||'—'}</td><td>{row.expiry_date||'—'}</td><td>{row.quantity_on_hand}</td>
    <td>{money(row.unit_cost)}</td><td>{money(row.stock_value)}</td><td>{row.status}</td></tr>)}</tbody>
  </table>{!stock.length&&<div className="empty">No batches found.</div>}</div></div>
  <div className="card section-gap"><h2>Latest stock movements</h2><p className="card-sub">The table shows up to 50 movements. Exports include all movements matching the current filters.</p><div className="table-wrap"><table>
   <thead><tr><th>Recorded (PKT)</th><th>Warehouse</th><th>Product / Batch</th><th>Change</th><th>Reference</th><th>Note</th><th>Recorded by</th></tr></thead>
   <tbody>{movements.map(row=><tr key={row.id}><td>{row.recorded_at}</td><td>{row.warehouse}</td><td>
    <Link href={`/inventory/movements/${row.id}`}>{row.product} / {row.batch_number}</Link></td><td>{row.quantity_delta>0?'+':''}{row.quantity_delta}</td>
    <td>{[row.reference_type,row.reference_id].filter(Boolean).join(' ')||row.movement_type}</td><td>{row.note||'—'}</td><td>{row.staff||'System'}</td></tr>)}</tbody>
  </table>{!movements.length&&<div className="empty">No stock movements found.</div>}</div></div>
 </>;
}
