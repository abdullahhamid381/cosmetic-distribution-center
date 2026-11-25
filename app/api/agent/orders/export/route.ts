import {requireAgent} from '@/lib/agent-portal';
import {customerOrders} from '@/lib/sales-team-data';
import {filterDepartmentOrders,csvCell} from '@/lib/sales-department';
import {paymentBalance,paymentPlanLabel,customerPaymentStatus,orderFinancials} from '@/lib/sales-team';
export async function GET(request:Request){
 const {user}=await requireAgent(),p=new URL(request.url).searchParams;
 let orders;try{orders=filterDepartmentOrders(await customerOrders(user.id),{q:p.get('q')||undefined,status:p.get('status')||undefined,from:p.get('from')||undefined,to:p.get('to')||undefined}).filter(o=>!p.get('plan')||o.payment_plan===p.get('plan'));}catch{return Response.json({error:'Invalid dates.'},{status:400});}
 const rows:unknown[][]=[['My order','Created (Pakistan)','Customer','Phone','Address','City','Order status','Retail total','Shipping charge','Order total','Payment arrangement','Payment status','Confirmed paid','Amount due','Refund due','Reported advance awaiting verification','Courier','Tracking','My gross commission','Return charges to my account','My net commission adjustment']];
 for(const o of orders){const b=paymentBalance(o),f=orderFinancials(o);rows.push(['CO-'+o.id,o.created_date,o.customer_name,o.phone,o.address,o.city,o.status,o.retail_total,o.shipping_charge,Number(o.retail_total)+Number(o.shipping_charge),paymentPlanLabel(o.payment_plan),customerPaymentStatus(o),b.collected,b.due,b.refundDue,o.pending_advance,o.courier_name,o.tracking_number,f.commission,f.agentReturnDeduction,f.netCommission]);}
 return new Response('\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="my-customer-orders.csv"','Cache-Control':'private, no-store'}});
}
