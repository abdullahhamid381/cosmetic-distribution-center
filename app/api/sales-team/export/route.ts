import {requireRole} from '@/lib/auth';
import {customerOrders} from '@/lib/sales-team-data';
import {filterDepartmentOrders,csvCell,DepartmentFilters} from '@/lib/sales-department';
import {orderFinancials,paymentBalance} from '@/lib/sales-team';
export async function GET(request:Request){
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS'),params=new URL(request.url).searchParams;
 const filters:DepartmentFilters={};for(const key of ['q','status','agent','from','to','priority','payment'] as const)filters[key]=params.get(key)||undefined;
 let orders;try{orders=filterDepartmentOrders(await customerOrders(user.role==='SALES'?user.id:null),filters);}catch{return Response.json({error:'Invalid report date range.'},{status:400});}
 const rows:unknown[][]=[['Order','Order date (Pakistan)','Agent','Customer','Phone','City','Address','Status','Priority','Source','Courier','Tracking','Retail total','Product cost','Customer shipping charge','Courier cost','Additional shipping cost','Return cost','Agent %','Recognized profit','Gross sales agent commission','Business net including agent return receivables','Net collected','Amount due','Refund due','Broker','Commission basis','Broker %','Broker commission','Total commission','Return charges deducted from agent','Net sales agent earnings']];
 for(const o of orders){const f=orderFinancials(o),p=paymentBalance(o);rows.push(['CO-'+o.id,o.created_date,o.agent_name,o.customer_name,o.phone,o.city,o.address,o.status,o.priority,o.source,o.courier_name,o.tracking_number,o.retail_total,o.product_cost,o.shipping_charge,o.courier_cost,o.shipping_cost,o.return_cost,o.commission_pct,f.profit,f.commission,f.net,p.collected,p.due,p.refundDue,o.broker_name,o.commission_basis,o.broker_pct,f.brokerCommission,f.totalCommission,f.agentReturnDeduction,f.netCommission]);}
 return new Response('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="sales-department.csv"','Cache-Control':'private, no-store'}});
}
