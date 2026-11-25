import 'server-only';
import {query} from './db';
import type {OrderStatus} from './sales-team';
export type CustomerOrder = Record<string, any> & {id:string;status:OrderStatus;retail_total:string;product_cost:string;shipping_charge:string;courier_cost:string;shipping_cost:string;return_cost:string;commission_pct:string};
export type DepartmentAgent=Record<string,any>&{id:string;full_name:string;user_id:string;phone:string;email:string;role:string;designation:string;territory:string;address:string;joined_on:string;notes:string;commission_pct:string;active:boolean;user_active:boolean;retail_target:string;order_target:number;paid:string};
export async function customerOrders(agentUserId: number | null = null, orderId: string | null = null, localOnly=false) {
 return query<CustomerOrder>(`SELECT o.*,o.expected_delivery::text AS expected_delivery,COALESCE(u.full_name,'Local sale') AS agent_name,broker.full_name AS broker_name,
 (o.created_at AT TIME ZONE 'Asia/Karachi')::date::text AS created_date,
 (o.delivered_at AT TIME ZONE 'Asia/Karachi')::date::text AS delivered_date,
 COALESCE(t.retail_total,0) AS retail_total,COALESCE(t.product_cost,0) AS product_cost,
 COALESCE(pay.collected,0) AS collected,COALESCE(reports.pending_advance,0) AS pending_advance
 FROM customer_orders o LEFT JOIN sales_agents a ON a.id=o.agent_id LEFT JOIN users u ON u.id=a.user_id
 LEFT JOIN sales_brokers broker ON broker.id=o.broker_id
 LEFT JOIN LATERAL (SELECT SUM(quantity*retail_price) AS retail_total,SUM(quantity*unit_cost) AS product_cost
 FROM customer_order_items WHERE order_id=o.id) t ON true
 LEFT JOIN LATERAL (SELECT SUM(CASE WHEN kind='COLLECTION' THEN amount ELSE -amount END) AS collected FROM customer_order_payments WHERE order_id=o.id) pay ON true
 LEFT JOIN LATERAL (SELECT SUM(amount) AS pending_advance FROM order_payment_reports WHERE order_id=o.id AND status='PENDING') reports ON true
 WHERE ($1::bigint IS NULL OR a.user_id=$1) AND ($2::bigint IS NULL OR o.id=$2)
 AND (NOT $3::boolean OR o.agent_id IS NULL) ORDER BY o.id DESC`,[agentUserId,orderId,localOnly]);
}
export async function departmentAgents(userId:number|null=null,month:string|null=null){
 return query<DepartmentAgent>(`SELECT a.*,a.joined_on::text AS joined_on,u.full_name,u.email,u.active AS user_active,u.role,
 COALESCE(t.retail_target,0) AS retail_target,COALESCE(t.order_target,0) AS order_target,
 COALESCE(p.paid,0) AS paid FROM sales_agents a JOIN users u ON u.id=a.user_id
 LEFT JOIN sales_agent_targets t ON t.agent_id=a.id AND t.month=$2::date
 LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM sales_commission_payouts WHERE agent_id=a.id) p ON true
 WHERE ($1::bigint IS NULL OR a.user_id=$1) ORDER BY u.full_name`,[userId,month]);
}
export async function departmentFollowups(userId:number|null=null){
 return query(`SELECT f.*,f.due_date::text AS due_date,o.customer_name,o.phone,o.status,o.agent_id,u.full_name AS agent_name
 FROM sales_followups f JOIN customer_orders o ON o.id=f.order_id JOIN sales_agents a ON a.id=o.agent_id JOIN users u ON u.id=a.user_id
 WHERE ($1::bigint IS NULL OR a.user_id=$1) ORDER BY (f.completed_at IS NOT NULL),f.due_date,f.id`,[userId]);
}
