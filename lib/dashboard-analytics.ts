import {query} from './db';

export async function dashboardAnalytics(from:string|null,to:string,period:string){
 const daily=['today','week','month'].includes(period);
 const params=[from,to,daily?'day':'month'];
 const [activity,products,cities,payments]=await Promise.all([
  query<{bucket:string;sales:string;collected:string}>(`WITH bounds AS (
   SELECT COALESCE($1::date,(date_trunc('month',$2::date)-interval '5 months')::date) AS start_date,$2::date AS end_date
  ), buckets AS (
   SELECT generate_series(date_trunc($3,start_date),date_trunc($3,end_date),CASE WHEN $3='day' THEN interval '1 day' ELSE interval '1 month' END) AS bucket FROM bounds
  ), sales AS (
   SELECT date_trunc($3,issue_date) AS bucket,SUM(total) AS amount FROM invoices,bounds
   WHERE issue_date BETWEEN start_date AND end_date GROUP BY 1
  ), receipts AS (
   SELECT date_trunc($3,payment_date) AS bucket,SUM(amount) AS amount FROM payments,bounds
   WHERE payment_date BETWEEN start_date AND end_date GROUP BY 1
  ) SELECT to_char(b.bucket,'YYYY-MM-DD') AS bucket,COALESCE(s.amount,0) AS sales,COALESCE(r.amount,0) AS collected
  FROM buckets b LEFT JOIN sales s USING(bucket) LEFT JOIN receipts r USING(bucket) ORDER BY b.bucket`,params),
  query<{id:string;name:string;sku:string;units:string}>(`SELECT p.id,p.name,p.sku,SUM(ii.quantity-COALESCE(r.units,0)) AS units
   FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN products p ON p.id=ii.product_id
   LEFT JOIN (SELECT invoice_item_id,SUM(quantity) AS units FROM sales_return_items GROUP BY invoice_item_id) r ON r.invoice_item_id=ii.id
   WHERE ($1::date IS NULL OR i.issue_date >= $1) AND i.issue_date <= $2::date
   GROUP BY p.id HAVING SUM(ii.quantity-COALESCE(r.units,0))>0 ORDER BY units DESC,p.id`,[from,to]),
  query<{city:string;shops:string;sales:string}>(`SELECT COALESCE(NULLIF(trim(s.city),''),'City not set') AS city,COUNT(DISTINCT s.id) AS shops,SUM(i.total) AS sales
   FROM invoices i JOIN shops s ON s.id=i.shop_id
   WHERE ($1::date IS NULL OR i.issue_date >= $1) AND i.issue_date <= $2::date
   GROUP BY 1 ORDER BY sales DESC,city`,[from,to]),
  query<{id:string;payment_no:string;shop_name:string;method:string;amount:string;payment_date:string}>(`SELECT p.id,p.payment_no,s.shop_name,p.method,p.amount,to_char(p.payment_date,'YYYY-MM-DD') AS payment_date
   FROM payments p JOIN shops s ON s.id=p.shop_id
   WHERE ($1::date IS NULL OR p.payment_date >= $1) AND p.payment_date <= $2::date
   ORDER BY p.payment_date DESC,p.id DESC LIMIT 5`,[from,to]),
 ]);
 return {activity,products,cities,payments,daily};
}
