import {orderFinancials,expectedAgentCommission,paymentBalance,commissionBalance,pakistanToday,validDate} from './sales-team';
import type {CustomerOrder} from './sales-team-data';
export type DepartmentFilters={q?:string;status?:string;agent?:string;from?:string;to?:string;priority?:string;payment?:string};
export function targetMonth(value?:string){const month=value||pakistanToday().slice(0,7);if(!/^\d{4}-\d{2}$/.test(month))throw new Error('Choose a valid month.');validDate(month+'-01');return month;}
export function filterDepartmentOrders(orders:CustomerOrder[],filters:DepartmentFilters){
 if(filters.from)validDate(filters.from);if(filters.to)validDate(filters.to);
 if(filters.from && filters.to && filters.from>filters.to)throw new Error('Start date must be before the end date.');
 return orders.filter(o=>{
  const b=paymentBalance(o),matchesPayment=!filters.payment||({REPORTED:Number(o.pending_advance||0)>0,UNPAID:b.collected===0&&b.due>0,PARTIAL:b.collected>0&&b.due>0,PAID:b.billed>0&&b.due===0,REFUND_DUE:b.refundDue>0} as Record<string,boolean>)[filters.payment];
  return matchesPayment&&(!filters.status||o.status===filters.status)&&(!filters.agent||String(o.agent_id)===filters.agent)&&(!filters.priority||o.priority===filters.priority)&&(!filters.from||o.created_date>=filters.from)&&(!filters.to||o.created_date<=filters.to)&&(!filters.q||[o.id,o.customer_name,o.phone,o.agent_name,o.tracking_number,o.city].join(' ').toLowerCase().includes(filters.q.toLowerCase()));
 });
}
export function departmentTotals(orders:CustomerOrder[]){
 const result={orders:orders.length,delivered:0,retail:0,profit:0,commission:0,returnDeductions:0,netCommission:0,brokerCommission:0,totalCommission:0,net:0,collected:0,due:0,refundDue:0,courier:0,shipping:0,returns:0};
 const c=(v:number|string)=>Math.round(Number(v)*100);
 for(const o of orders){const f=orderFinancials(o),p=paymentBalance(o);if(o.status==='DELIVERED'){result.delivered++;result.retail+=c(o.retail_total);}result.profit+=c(f.profit);result.commission+=c(f.commission);result.returnDeductions+=c(f.agentReturnDeduction);result.netCommission+=c(f.netCommission);result.brokerCommission+=c(f.brokerCommission);result.totalCommission+=c(f.totalCommission);result.net+=c(f.net);result.collected+=c(p.collected);result.due+=c(p.due);result.refundDue+=c(p.refundDue);result.courier+=c(o.courier_cost);result.shipping+=c(o.shipping_cost);result.returns+=c(o.return_cost);}
 return {...result,retail:result.retail/100,profit:result.profit/100,commission:result.commission/100,returnDeductions:result.returnDeductions/100,netCommission:result.netCommission/100,brokerCommission:result.brokerCommission/100,totalCommission:result.totalCommission/100,net:result.net/100,collected:result.collected/100,due:result.due/100,refundDue:result.refundDue/100,courier:result.courier/100,shipping:result.shipping/100,returns:result.returns/100};
}
export function agentPerformance(orders:CustomerOrder[],agentId:string,paid:number,month:string){
 const own=orders.filter(o=>String(o.agent_id)===String(agentId));
 const earned=own.reduce((sum,o)=>sum+Math.round(orderFinancials(o).commission*100),0)/100;
 const returnDeductions=own.reduce((sum,o)=>sum+Math.round(orderFinancials(o).agentReturnDeduction*100),0)/100;
 const expected=own.reduce((sum,o)=>sum+Math.round(expectedAgentCommission(o)*100),0)/100;
 const monthly=own.filter(o=>o.status==='DELIVERED'&&o.delivered_date?.slice(0,7)===month);
 const retail=monthly.reduce((sum,o)=>sum+Math.round(Number(o.retail_total)*100),0)/100;
 return {orders:own.length,delivered:monthly.length,retail,earned,expected,returnDeductions,netEarned:(Math.round(earned*100)-Math.round(returnDeductions*100))/100,...commissionBalance(earned,paid,returnDeductions)};
}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
