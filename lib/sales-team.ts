export const orderStatuses = ['PENDING','DISPATCHED','DELIVERED','RETURNED','CANCELLED'] as const;
export type OrderStatus = typeof orderStatuses[number];
export const paymentMethods = ['CASH','BANK','EASYPAISA','JAZZCASH','COD','OTHER'] as const;
export const paymentPlans = ['COD','ADVANCE','PENDING'] as const;
export const paymentPlanLabel=(value:string)=>({COD:'Cash on delivery',ADVANCE:'Advance payment',PENDING:'Payment pending'}[value]||value);
export function customerPaymentStatus(order:Parameters<typeof paymentBalance>[0]&{pending_advance?:number|string}){
 const b=paymentBalance(order);
 if(b.refundDue>0)return 'Refund due';
 if(['CANCELLED','RETURNED'].includes(order.status))return 'Closed';
 if(b.due===0)return 'Paid';
 if(Number(order.pending_advance||0)>0)return b.collected>0?'Partially paid · advance awaiting verification':'Advance reported · awaiting verification';
 return b.collected>0?'Partially paid':'Payment pending';
}
export function pakistanToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function validDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Enter a valid date.');
 return value;
}
export function paymentBalance(order:{status:string;retail_total:number|string;shipping_charge:number|string;collected?:number|string}){
 const billed=['CANCELLED','RETURNED'].includes(order.status)?0:Math.round(Number(order.retail_total)*100)+Math.round(Number(order.shipping_charge)*100);
 const collected=Math.round(Number(order.collected||0)*100);
 return {billed:billed/100,collected:collected/100,due:Math.max(0,billed-collected)/100,refundDue:Math.max(0,collected-billed)/100};
}
export function commissionBalance(earned:number,paid:number,deductions=0){
 const balance=Math.round(earned*100)-Math.round(deductions*100)-Math.round(paid*100);
 return {due:Math.max(0,balance)/100,recovery:Math.max(0,-balance)/100};
}
export function canTransition(from: OrderStatus, to: OrderStatus) {
  if (from === to) return true;
  return ({PENDING:['DISPATCHED','CANCELLED'],DISPATCHED:['DELIVERED','RETURNED'],DELIVERED:['RETURNED'],RETURNED:[],CANCELLED:[]} as Record<OrderStatus, string[]>)[from].includes(to);
}
export function orderFinancials(order: {status: string; retail_total: number | string; product_cost: number | string; shipping_charge: number | string; courier_cost: number | string; shipping_cost: number | string; return_cost: number | string; commission_pct: number | string;commission_basis?:string;broker_id?:string|number|null;broker_pct?:number|string}) {
  const c = (n: number | string) => Math.round(Number(n) * 100);
  const expenses = c(order.courier_cost) + c(order.shipping_cost) + c(order.return_cost);
  const projected = c(order.retail_total) + c(order.shipping_charge) - c(order.product_cost) - expenses;
  const profit = order.status === 'DELIVERED' ? projected : ['RETURNED','CANCELLED'].includes(order.status) ? -expenses : 0;
  const base=order.commission_basis==='RETAIL'?c(order.retail_total):Math.max(0,profit);
  const commission = order.status === 'DELIVERED' ? Math.round(base * Number(order.commission_pct) / 100) : 0;
  const brokerCommission=order.status==='DELIVERED'&&order.broker_id?Math.round(base*Number(order.broker_pct??10)/100):0;
  const agentReturnDeduction=order.status==='RETURNED'?expenses:0;
  const netCommission=commission-agentReturnDeduction;
  // A returned-package debit is an agent receivable, not a cash receipt or an additional expense.
  return {projected: projected / 100, profit: profit / 100, commission: commission / 100,agentReturnDeduction:agentReturnDeduction/100,netCommission:netCommission/100,brokerCommission:brokerCommission/100,totalCommission:(commission+brokerCommission)/100, net: (profit - netCommission - brokerCommission) / 100};
}
export type OrderProfitInput=Parameters<typeof orderFinancials>[0];
export function expectedAgentCommission(order:OrderProfitInput){
 return ['PENDING','DISPATCHED'].includes(order.status)?orderFinancials({...order,status:'DELIVERED'}).commission:0;
}
export function orderProfitPreview(order:OrderProfitInput){
 const closed=['RETURNED','CANCELLED'].includes(order.status);
 const financials=orderFinancials(closed?order:{...order,status:'DELIVERED'});
 const c=(value:number|string)=>Math.round(Number(value)*100);
 const revenue=closed?0:c(order.retail_total)+c(order.shipping_charge);
 const productCost=closed?0:c(order.product_cost);
 const deliveryCosts=c(order.courier_cost)+c(order.shipping_cost)+c(order.return_cost);
 return {estimated:['PENDING','DISPATCHED'].includes(order.status),revenue:revenue/100,productCost:productCost/100,deliveryCosts:deliveryCosts/100,totalCosts:(productCost+deliveryCosts)/100,profit:financials.profit,agentProfit:financials.netCommission,agentReturnDeduction:financials.agentReturnDeduction,brokerProfit:financials.brokerCommission,totalCommission:financials.totalCommission,netProfit:financials.net};
}
