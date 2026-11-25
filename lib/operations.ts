import {query} from './db';

// Keep every operational cutoff on the business timezone, regardless of server location.
export async function operationsData() {
 const today="(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date";
 const [aging,reorder,expiry,collections]=await Promise.all([
  query(`WITH balances AS (SELECT total-paid_total-credit_total AS balance, GREATEST(0,${today}-due_date) AS days FROM invoices WHERE total>paid_total+credit_total)
   SELECT COALESCE(SUM(balance) FILTER(WHERE days=0),0) AS current,
   COALESCE(SUM(balance) FILTER(WHERE days BETWEEN 1 AND 30),0) AS days30,
   COALESCE(SUM(balance) FILTER(WHERE days BETWEEN 31 AND 60),0) AS days60,
   COALESCE(SUM(balance) FILTER(WHERE days BETWEEN 61 AND 90),0) AS days90,
   COALESCE(SUM(balance) FILTER(WHERE days>90),0) AS older FROM balances`),
  query(`WITH stock AS (SELECT product_id,SUM(quantity_on_hand) FILTER(WHERE expiry_date IS NULL OR expiry_date>=${today}) AS units FROM batches GROUP BY product_id),
   demand AS (SELECT ii.product_id,SUM(ii.quantity) AS units FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.issue_date BETWEEN ${today}-29 AND ${today} GROUP BY ii.product_id)
   SELECT p.id,p.name,p.sku,p.min_stock,COALESCE(s.units,0) AS available,COALESCE(d.units,0) AS sold30,
   GREATEST(p.min_stock,CEIL(COALESCE(d.units,0)*1.0))-COALESCE(s.units,0) AS suggested
   FROM products p LEFT JOIN stock s ON s.product_id=p.id LEFT JOIN demand d ON d.product_id=p.id
   WHERE p.active AND COALESCE(s.units,0)<=GREATEST(p.min_stock,CEIL(COALESCE(d.units,0)*1.0))
   ORDER BY COALESCE(s.units,0),p.name`),
  query(`SELECT b.id,p.name,b.batch_number,w.name AS warehouse,b.quantity_on_hand,b.quantity_on_hand*b.unit_cost AS value,
   to_char(b.expiry_date,'YYYY-MM-DD') AS expiry_date,b.expiry_date-${today} AS days
   FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id
   WHERE b.quantity_on_hand>0 AND b.expiry_date<=${today}+90 ORDER BY b.expiry_date,b.id`),
  query(`SELECT i.id,i.invoice_no,s.shop_name,s.phone,to_char(i.due_date,'YYYY-MM-DD') AS due_date,
   i.total-i.paid_total-i.credit_total AS balance,${today}-i.due_date AS days
   FROM invoices i JOIN shops s ON s.id=i.shop_id
   WHERE i.total>i.paid_total+i.credit_total AND i.due_date<${today}
   ORDER BY i.due_date,i.id`)
 ]);
 return {aging:aging[0],reorder,expiry,collections};
}
