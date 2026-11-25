import { query } from './db';
import type { QueryResultRow } from 'pg';
export async function dashboardTotals() {
  const [counts] = await query(`SELECT
   (SELECT COALESCE(SUM(quantity_on_hand),0) FROM batches) AS units,
   (SELECT COALESCE(SUM(total-paid_total-credit_total),0) FROM invoices) AS pending`);
  return counts;
}
export async function listProducts() { return query(`SELECT p.*,m.name as manufacturer, COALESCE(SUM(b.quantity_on_hand),0)::int AS stock FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN batches b ON b.product_id=p.id GROUP BY p.id,m.name ORDER BY p.id DESC`); }
export async function listShops() {return query(`SELECT s.*, COALESCE((SELECT SUM(i.total-i.paid_total-i.credit_total) FROM invoices i WHERE i.shop_id=s.id),0) AS pending, COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.shop_id=s.id),0) AS invoiced FROM shops s ORDER BY s.id DESC`);}
export async function shopBalances() {return query(`SELECT s.id,s.shop_name,s.phone,s.city,s.default_discount, COALESCE(SUM(i.total),0) AS sales,COALESCE(SUM(i.paid_total),0) AS collected, COALESCE(SUM(i.credit_total),0) AS credits,COALESCE(SUM(i.total-i.paid_total-i.credit_total),0) AS pending FROM shops s LEFT JOIN invoices i ON i.shop_id=s.id GROUP BY s.id ORDER BY pending DESC`);}
export async function warehouses() {return query('SELECT * FROM warehouses WHERE active=true ORDER BY name');}
export async function manufacturers() {return query('SELECT * FROM manufacturers ORDER BY name');}
export async function lastInvoices() {return query(`SELECT i.*,s.shop_name FROM invoices i JOIN shops s ON s.id=i.shop_id ORDER BY i.id DESC LIMIT 50`);}
export async function batches() {return query(`SELECT b.*,p.sku,p.name AS product_name,w.name AS warehouse_name FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id ORDER BY b.expiry_date NULLS LAST,b.id DESC`);}
export async function expenses() {return query('SELECT * FROM expenses ORDER BY expense_date DESC,id DESC LIMIT 150');}
export async function lastPayments(range:{from?:string;to?:string}={}) {
 const conditions:string[]=[],params:string[]=[];
 if(range.from){params.push(range.from);conditions.push(`p.payment_date >= $${params.length}::date`);}
 if(range.to){params.push(range.to);conditions.push(`p.payment_date <= $${params.length}::date`);}
 return query(`SELECT p.*,to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,s.shop_name,EXISTS(SELECT 1 FROM payment_receipts pr WHERE pr.payment_id=p.id) AS has_receipt FROM payments p JOIN shops s ON s.id=p.shop_id
 ${conditions.length?'WHERE '+conditions.join(' AND '):''}
 ORDER BY p.payment_date DESC,p.id DESC ${conditions.length?'':'LIMIT 100'}`,params);
}
export async function salesTrend() {return query(`SELECT TO_CHAR(DATE_TRUNC('month',issue_date),'YYYY-MM') AS month, SUM(total-credit_total) AS net_sales FROM invoices GROUP BY 1 ORDER BY 1 DESC LIMIT 6`);}
export async function queryOne<T extends QueryResultRow = QueryResultRow>(text:string, params:unknown[]=[]):Promise<T|null> { return (await query<T>(text, params))[0] ?? null; }
