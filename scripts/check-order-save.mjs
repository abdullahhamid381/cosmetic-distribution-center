import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await client.connect();
 const result=await client.query(`SELECT o.id,o.status,o.updated_at,o.commission_basis,o.commission_pct,o.broker_pct,
 length(trim(o.customer_name))>0 AS has_customer,length(trim(o.phone))>0 AS has_phone,
 length(trim(o.address))>0 AS has_address,length(trim(o.city))>0 AS has_city,
 length(trim(o.courier_name))>0 AS has_courier,length(trim(o.tracking_number))>0 AS has_tracking,
 (SELECT COUNT(*) FROM customer_order_items WHERE order_id=o.id) AS product_lines,
 (SELECT COUNT(*) FROM customer_order_items i JOIN batches b ON b.id=i.batch_id JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE i.order_id=o.id AND (b.quantity_on_hand<i.quantity OR NOT p.active OR NOT w.active OR (b.expiry_date IS NOT NULL AND b.expiry_date<CURRENT_DATE))) AS dispatch_stock_issues,
 (SELECT COUNT(*) FROM customer_order_history WHERE order_id=o.id) AS saved_history_entries,
 (SELECT MAX(created_at) FROM customer_order_history WHERE order_id=o.id) AS last_saved_history
 FROM customer_orders o ORDER BY o.id DESC LIMIT 10`);
 console.log(JSON.stringify(result.rows,null,2));
}catch(error){console.error('Order save diagnostic failed:',error.code||'',error.message);process.exitCode=1;}finally{await client.end().catch(()=>{});}
