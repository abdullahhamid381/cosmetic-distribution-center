import {invoiceDiscountSummary} from './invoice-discount';
import {shopBrokerFinancials} from './shop-broker';
import {query} from './db';

export function reportFilters(input:{shop?:string;from?:string;to?:string;product?:string}) {
 const product=typeof input.product==='string'?input.product:'';
 const shop=typeof input.shop==='string'?input.shop:'',from=typeof input.from==='string'?input.from:'',to=typeof input.to==='string'?input.to:'';
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const error=shop&&(!/^\d+$/.test(shop)||!Number.isSafeInteger(Number(shop))||Number(shop)<1)?'Choose a valid store.':(from&&!validDate(from))||(to&&!validDate(to))?'Enter valid From and To dates.':from&&to&&from>to?'From date must be on or before To date.':'';
 const productError=product&&(!/^\d+$/.test(product)||!Number.isSafeInteger(Number(product))||Number(product)<1)?'Choose a valid product.':'';
 return {shop,from,to,product,error:error||productError};
}
export async function businessReport(filters:ReturnType<typeof reportFilters>) {
 if(filters.error)throw new Error(filters.error);
 const {shop,from,to}=filters,params=[shop||null,from||null,to||null];
 const scope=`($1::bigint IS NULL OR i.shop_id=$1) AND ($2::date IS NULL OR i.issue_date >= $2) AND ($3::date IS NULL OR i.issue_date <= $3)`;
 const [invoices,products,payments,returns,expenseDetails,productDetails,localRows]=await Promise.all([
  query(`SELECT i.*,to_char(i.issue_date,'YYYY-MM-DD') AS issue_date,to_char(i.due_date,'YYYY-MM-DD') AS due_date,
   s.shop_name,s.phone,s.city,s.default_discount,d.delivery_no,d.status AS delivery_status,broker.full_name AS broker_name,COALESCE(broker_items.retail_net,0) AS retail_net,broker_items.shop_pct_min,broker_items.shop_pct_max,
   i.total-i.paid_total-i.credit_total AS remaining,(i.due_date<CURRENT_DATE AND i.total>i.paid_total+i.credit_total) AS overdue
   FROM invoices i JOIN shops s ON s.id=i.shop_id LEFT JOIN deliveries d ON d.id=i.delivery_id
   LEFT JOIN sales_brokers broker ON broker.id=i.broker_id
   LEFT JOIN LATERAL(SELECT SUM((ii.quantity-COALESCE(r.qty,0))*ii.retail_unit_price) AS retail_net,MIN(ii.discount_pct) AS shop_pct_min,MAX(ii.discount_pct) AS shop_pct_max FROM invoice_items ii LEFT JOIN LATERAL(SELECT SUM(quantity) AS qty FROM sales_return_items WHERE invoice_item_id=ii.id) r ON true WHERE ii.invoice_id=i.id) broker_items ON true
   WHERE ${scope} ORDER BY i.issue_date DESC,i.id DESC`,params),
  query(`SELECT p.id,p.name,p.sku,SUM(ii.quantity) AS units,SUM(COALESCE(r.qty,0)) AS returned_units,
   SUM(ii.trade_unit_price*ii.quantity) AS trade_dispatch_cost,SUM(ii.trade_unit_price*COALESCE(r.qty,0)) AS trade_return_cost,
   SUM(ii.unit_cost*ii.quantity) AS dispatch_cost,SUM(ii.unit_cost*COALESCE(r.qty,0)) AS return_cost,
   SUM(ii.line_total) AS original,SUM(COALESCE(r.credit,0)) AS credits,
   SUM(ii.line_total-COALESCE(r.credit,0)-ii.unit_cost*(ii.quantity-COALESCE(r.qty,0))) AS gross
   FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN products p ON p.id=ii.product_id
   LEFT JOIN (SELECT invoice_item_id,SUM(quantity) AS qty,SUM(credit_amount) AS credit FROM sales_return_items GROUP BY invoice_item_id) r ON r.invoice_item_id=ii.id
   WHERE ${scope} GROUP BY p.id ORDER BY original DESC`,params),
  query(`SELECT p.id,p.payment_no,p.amount,p.method,p.reference,p.note,to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,
   s.shop_name,EXISTS(SELECT 1 FROM payment_receipts pr WHERE pr.payment_id=p.id) AS has_receipt
   FROM payments p JOIN shops s ON s.id=p.shop_id WHERE ($1::bigint IS NULL OR p.shop_id=$1)
   AND ($2::date IS NULL OR p.payment_date >= $2) AND ($3::date IS NULL OR p.payment_date <= $3)
   ORDER BY p.payment_date DESC,p.id DESC`,params),
  query(`SELECT r.id,r.return_no,r.reason,r.total_credit,to_char(r.created_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD') AS return_date,
   i.id AS invoice_id,i.invoice_no,s.shop_name FROM sales_returns r JOIN invoices i ON i.id=r.invoice_id JOIN shops s ON s.id=r.shop_id
   WHERE ($1::bigint IS NULL OR r.shop_id=$1) AND ($2::date IS NULL OR (r.created_at AT TIME ZONE 'Asia/Karachi')::date >= $2)
   AND ($3::date IS NULL OR (r.created_at AT TIME ZONE 'Asia/Karachi')::date <= $3) ORDER BY r.created_at DESC,r.id DESC`,params),
  query(`SELECT e.id,e.title,e.category,e.amount,e.note,to_char(e.expense_date,'YYYY-MM-DD') AS expense_date,
   COALESCE(u.full_name,'Not recorded') AS recorded_by FROM expenses e LEFT JOIN users u ON u.id=e.created_by
   WHERE ($1::date IS NULL OR e.expense_date >= $1) AND ($2::date IS NULL OR e.expense_date <= $2)
   ORDER BY e.expense_date DESC,e.id DESC`,[from||null,to||null]),
  query(`SELECT ii.id,i.id AS invoice_id,i.invoice_no,to_char(i.issue_date,'YYYY-MM-DD') AS issue_date,s.shop_name,p.name,p.sku,b.batch_number,
   ii.quantity AS units,ii.discount_pct,ii.unit_cost,ii.trade_unit_price,ii.trade_unit_price*ii.quantity AS trade_dispatch_cost,
   ii.trade_unit_price*COALESCE(r.qty,0) AS trade_return_cost,
   ii.applied_unit_price AS dispatch_unit_price,ii.line_total AS dispatch_value,
   COALESCE(r.credit,0) AS return_value,ii.line_total-COALESCE(r.credit,0) AS net_value,COALESCE(r.qty,0) AS returned_units,
   ii.quantity*ii.unit_cost AS dispatch_cost,COALESCE(r.qty,0)*ii.unit_cost AS return_cost,
   (ii.quantity-COALESCE(r.qty,0))*ii.unit_cost AS net_cost
   FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN shops s ON s.id=i.shop_id
   JOIN products p ON p.id=ii.product_id JOIN batches b ON b.id=ii.batch_id
   LEFT JOIN (SELECT invoice_item_id,SUM(quantity) AS qty,SUM(credit_amount) AS credit FROM sales_return_items GROUP BY invoice_item_id) r ON r.invoice_item_id=ii.id
   WHERE ${scope} AND ($4::bigint IS NULL OR ii.product_id=$4) ORDER BY i.issue_date DESC,i.id DESC,ii.id`,[...params,filters.product||null]),
  shop?Promise.resolve([]):query(`SELECT o.id,o.customer_name,o.phone,o.status,items.products,
   to_char(o.delivered_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD') AS sale_date,
   COALESCE(items.sales,0) AS original,
   CASE WHEN o.status='DELIVERED' THEN COALESCE(items.sales,0) ELSE 0 END AS sales,
   (CASE WHEN o.status='DELIVERED' THEN COALESCE(items.cost,0) ELSE 0 END)+o.courier_cost+o.shipping_cost+o.return_cost AS cost,
   COALESCE(pay.received,0) AS received
   FROM customer_orders o
   CROSS JOIN LATERAL(SELECT SUM(ci.quantity*ci.retail_price) AS sales,SUM(ci.quantity*ci.unit_cost) AS cost,
    string_agg(p.name||' × '||ci.quantity,', ' ORDER BY ci.id) AS products
    FROM customer_order_items ci JOIN products p ON p.id=ci.product_id WHERE ci.order_id=o.id) items
   CROSS JOIN LATERAL(SELECT SUM(CASE WHEN kind='COLLECTION' THEN amount ELSE -amount END) AS received FROM customer_order_payments WHERE order_id=o.id) pay
   WHERE o.agent_id IS NULL AND o.status IN ('DELIVERED','RETURNED')
   AND ($1::date IS NULL OR (o.delivered_at AT TIME ZONE 'Asia/Karachi')::date >= $1)
   AND ($2::date IS NULL OR (o.delivered_at AT TIME ZONE 'Asia/Karachi')::date <= $2)
   ORDER BY o.delivered_at DESC,o.id DESC`,params.slice(1)),
 ]);
 for(const invoice of invoices){const rates=[invoice.shop_pct_min,invoice.shop_pct_max].filter(rate=>rate!==null&&rate!==undefined).map(rate=>({discount_pct:Number(rate)}));invoice.shop_discount_percentage=invoiceDiscountSummary(rates,invoice.subtotal,invoice.discount_total).percentage;}
 const totals=invoices.reduce((sum,i)=>({original:sum.original+Number(i.total),received:sum.received+Number(i.paid_total),returns:sum.returns+Number(i.credit_total),remaining:sum.remaining+Number(i.remaining)}),{original:0,received:0,returns:0,remaining:0});
 const selectedProducts=filters.product?products.filter(p=>String(p.id)===filters.product):products;
 const productTotals=selectedProducts.reduce((sum,p)=>({units:sum.units+Number(p.units),returnedUnits:sum.returnedUnits+Number(p.returned_units),dispatchCost:sum.dispatchCost+Number(p.dispatch_cost),returnCost:sum.returnCost+Number(p.return_cost)}),{units:0,returnedUnits:0,dispatchCost:0,returnCost:0});
 const brokerDetails=invoices.filter(i=>i.broker_id).map(i=>({id:i.id,invoice_no:i.invoice_no,shop_name:i.shop_name,broker_name:i.broker_name,broker_pct:i.broker_pct,...shopBrokerFinancials({total:i.total,paid_total:i.paid_total,credit_total:i.credit_total,broker_pct:i.broker_pct,retail_net:i.retail_net})}));
 const brokerCommission=brokerDetails.reduce((s,i)=>({allocation:s.allocation+Math.round(i.allocation*100),earned:s.earned+Math.round(i.earned*100)}),{allocation:0,earned:0});
 const localSales=localRows.map(row=>{
  const sales=Number(row.sales),cost=Number(row.cost),received=Number(row.received);
  return {id:String(row.id),date:String(row.sale_date),customer:String(row.customer_name),phone:String(row.phone??''),products:String(row.products??''),status:String(row.status),original:Number(row.original),sales,cost,received,balance:sales-received,profit:sales-cost};
 });
 const local=localSales.reduce((sum,sale)=>({sales:sum.sales+sale.sales,cost:sum.cost+sale.cost,received:sum.received+sale.received,due:sum.due+Math.max(0,sale.balance),refundDue:sum.refundDue+Math.max(0,-sale.balance)}),{sales:0,cost:0,received:0,due:0,refundDue:0});
 const profitSales=totals.original-totals.returns+local.sales;
 const profitPending=totals.remaining+local.sales-local.received;
 const shopGross=products.reduce((sum,p)=>sum+Number(p.gross),0);
 const gross=shopGross+local.sales-local.cost;
 return {brokerDetails,brokerCommission:{allocation:brokerCommission.allocation/100,earned:brokerCommission.earned/100},invoices,products:selectedProducts,productDetails,productTotals,payments,returns,expenseDetails,totals,local,localSales,profitSales,profitPending,shopGross,gross,expenses:expenseDetails.reduce((sum,e)=>sum+Number(e.amount),0)};
}
