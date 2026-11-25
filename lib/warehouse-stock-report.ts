import {query} from '@/lib/db';

export function stockReportId(value:string|null|undefined) {
 return typeof value==='string'&&/^\d{1,18}$/.test(value)?value:'';
}

export function warehouseStockReport(warehouse:string,product:string) {
 return query(`SELECT b.id,w.name AS warehouse,p.name AS product,p.sku,b.batch_number,
  b.manufacture_date::text,b.expiry_date::text,b.quantity_on_hand,b.unit_cost,
  b.quantity_on_hand*b.unit_cost AS stock_value,
  CASE WHEN b.quantity_on_hand=0 THEN 'Out of stock'
   WHEN b.expiry_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date THEN 'Expired'
   WHEN NOT w.active OR NOT p.active THEN 'Inactive'
   ELSE 'Available' END AS status
  FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id
  WHERE ($1='' OR w.id::text=$1) AND ($2='' OR p.id::text=$2)
  ORDER BY w.name,p.name,b.expiry_date NULLS LAST,b.id`,[warehouse,product]);
}

export function warehouseMovementReport(warehouse:string,product:string,limit:number|null=null) {
 return query(`SELECT m.id,to_char(m.created_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD HH24:MI:SS') AS recorded_at,
  w.name AS warehouse,p.name AS product,p.sku,b.batch_number,m.movement_type,m.quantity_delta,
  m.reference_type,m.reference_id,m.note,u.full_name AS staff
  FROM stock_movements m JOIN products p ON p.id=m.product_id
  JOIN batches b ON b.id=m.batch_id JOIN warehouses w ON w.id=m.warehouse_id
  LEFT JOIN users u ON u.id=m.created_by
  WHERE ($1='' OR w.id::text=$1) AND ($2='' OR p.id::text=$2)
  ORDER BY m.id DESC LIMIT $3`,[warehouse,product,limit]);
}

export function warehouseStockTotals(stock:Awaited<ReturnType<typeof warehouseStockReport>>) {
 return stock.reduce((sum,row)=>({
  onHand:sum.onHand+Number(row.quantity_on_hand),
  available:sum.available+(row.status==='Available'?Number(row.quantity_on_hand):0),
  value:sum.value+Math.round(Number(row.stock_value)*100),
 }),{onHand:0,available:0,value:0});
}
