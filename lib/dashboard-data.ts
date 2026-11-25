import {query} from './db';
export async function dashboardActivity(from:string|null,to:string) {
 const params=[from,to];
 const [row]=await query(`WITH local_lines AS (
  SELECT (o.delivered_at AT TIME ZONE 'Asia/Karachi')::date AS sale_date,
         (o.returned_at AT TIME ZONE 'Asia/Karachi')::date AS return_date,
         SUM(i.quantity*i.retail_price) AS sales,SUM(i.quantity*i.unit_cost) AS cost,
         o.courier_cost+o.shipping_cost+o.return_cost AS charges
  FROM customer_orders o JOIN customer_order_items i ON i.order_id=o.id
  WHERE o.agent_id IS NULL GROUP BY o.id
 ), local_activity AS (
  SELECT
   COALESCE(SUM(sales) FILTER (WHERE ($1::date IS NULL OR sale_date >= $1) AND sale_date <= $2::date),0) AS sales,
   COALESCE(SUM(sales-cost) FILTER (WHERE ($1::date IS NULL OR sale_date >= $1) AND sale_date <= $2::date),0) AS gross,
   COALESCE(SUM(sales) FILTER (WHERE ($1::date IS NULL OR return_date >= $1) AND return_date <= $2::date),0) AS credits,
   COALESCE(SUM(cost) FILTER (WHERE ($1::date IS NULL OR return_date >= $1) AND return_date <= $2::date),0) AS reversed_cost,
   COALESCE(SUM(charges) FILTER (WHERE ($1::date IS NULL OR COALESCE(return_date,sale_date) >= $1) AND COALESCE(return_date,sale_date) <= $2::date),0) AS charges
  FROM local_lines
 ) SELECT
  (SELECT COALESCE(SUM(total),0) FROM invoices WHERE ($1::date IS NULL OR issue_date >= $1) AND issue_date <= $2::date) AS sales,
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE ($1::date IS NULL OR payment_date >= $1) AND payment_date <= $2::date) AS collected,
  (SELECT COALESCE(SUM(total_credit),0) FROM sales_returns WHERE ($1::date IS NULL OR (created_at AT TIME ZONE 'Asia/Karachi')::date >= $1) AND (created_at AT TIME ZONE 'Asia/Karachi')::date <= $2::date) AS return_credit,
  (SELECT COALESCE(SUM((ii.applied_unit_price-ii.unit_cost)*ii.quantity),0) FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ($1::date IS NULL OR i.issue_date >= $1) AND i.issue_date <= $2::date) AS gross_before_returns,
  (SELECT COALESCE(SUM(ii.unit_cost*ri.quantity),0) FROM sales_return_items ri JOIN sales_returns r ON r.id=ri.return_id JOIN invoice_items ii ON ii.id=ri.invoice_item_id WHERE ($1::date IS NULL OR (r.created_at AT TIME ZONE 'Asia/Karachi')::date >= $1) AND (r.created_at AT TIME ZONE 'Asia/Karachi')::date <= $2::date) AS returned_costs,
  (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE ($1::date IS NULL OR expense_date >= $1) AND expense_date <= $2::date) AS expenses,
  local_activity.sales AS local_sales,local_activity.credits AS local_return_credit,
  local_activity.gross-local_activity.credits+local_activity.reversed_cost-local_activity.charges AS local_profit,
  (SELECT COALESCE(SUM(CASE WHEN p.kind='COLLECTION' THEN p.amount ELSE -p.amount END),0)
   FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id
   WHERE o.agent_id IS NULL AND ($1::date IS NULL OR p.payment_date >= $1) AND p.payment_date <= $2::date) AS local_collected
  FROM local_activity`,params);
 return row;
}
