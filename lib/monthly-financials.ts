import {query} from './db';
import type {PoolClient,QueryResultRow} from 'pg';
import {monthlyRange} from './monthly-statement';

export type MonthlyFinancials={
 scopeShop:string|null;from:string;through:string;sales:number;returnCredits:number;dispatchedCost:number;returnedCost:number;netGoodsCost:number;businessExpenses:number;deductedExpenses:number;netProfit:number;received:number;
 calculationVersion?:'collections-v1';invoiceProfit?:number;openingResult?:number;closingResult?:number;priorSavedResult?:number|null;openingResultAdjustment?:number;
 missingRegisters?:string[];
 goods:{invoice:string;date:string;shop:string;product:string;batch:string;quantity:number;unitCost:number;totalCost:number;sales:number}[];
 returns:{reference:string;date:string;invoice:string;shop:string;credit:number;reversedCost:number}[];
 expenses:{reference:string;date:string;title:string;category:string;note:string;staff:string;amount:number}[];
 payments:{id:string;reference:string;date:string;shop:string;method:string;bankReference:string;note:string;staff:string;amount:number;invoices:string}[];
};
const sum=(rows:number[])=>rows.reduce((s,v)=>s+Math.round(v*100),0)/100;
export function financialTotals(goods:MonthlyFinancials['goods'],returns:MonthlyFinancials['returns'],expenses:MonthlyFinancials['expenses'],payments:MonthlyFinancials['payments'],shop:string|null){
 const sales=sum(goods.map(g=>g.sales)),returnCredits=sum(returns.map(r=>r.credit)),dispatchedCost=sum(goods.map(g=>g.totalCost)),returnedCost=sum(returns.map(r=>r.reversedCost)),businessExpenses=sum(expenses.map(e=>e.amount));
 const netGoodsCost=sum([dispatchedCost,-returnedCost]),deductedExpenses=shop?0:businessExpenses;
 const received=sum(payments.map(p=>p.amount));
 return {sales,returnCredits,dispatchedCost,returnedCost,netGoodsCost,businessExpenses,deductedExpenses,invoiceProfit:sum([sales,-returnCredits,-netGoodsCost,-deductedExpenses]),netProfit:sum([received,-netGoodsCost,-deductedExpenses]),received};
}
export function isCompleteFinancialSnapshot(value:unknown):value is MonthlyFinancials{
 if(!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 return !(Array.isArray(v.missingRegisters)&&v.missingRegisters.length)&&['goods','returns','expenses','payments'].every(key=>Array.isArray(v[key]))&&
 ['sales','returnCredits','dispatchedCost','returnedCost','netGoodsCost','businessExpenses','deductedExpenses','received','netProfit'].every(key=>typeof v[key]==='number'&&Number.isFinite(v[key]))&&typeof v.from==='string'&&typeof v.through==='string';
}
export function collectionClosing(input:Partial<MonthlyFinancials>|null|undefined,fallback?:MonthlyFinancials):MonthlyFinancials{
 const data=input||{},keys=['goods','returns','expenses','payments'] as const;
 const missingRegisters=[...new Set([...(data.missingRegisters||[]),...keys.filter(key=>!Array.isArray(data[key]))])];
 // Never substitute live registers into a saved historical snapshot.
 const goods=Array.isArray(data.goods)?data.goods:[],returns=Array.isArray(data.returns)?data.returns:[],expenses=Array.isArray(data.expenses)?data.expenses:[],payments=Array.isArray(data.payments)?data.payments:[];
 const scopeShop=data.scopeShop??fallback?.scopeShop??null;
 const derived=financialTotals(goods,returns,expenses,payments,scopeShop);
 const number=(value:unknown,otherwise=0)=>typeof value==='number'&&Number.isFinite(value)?value:otherwise;
 const sales=number(data.sales,derived.sales),returnCredits=number(data.returnCredits,derived.returnCredits),dispatchedCost=number(data.dispatchedCost,derived.dispatchedCost),returnedCost=number(data.returnedCost,derived.returnedCost),netGoodsCost=number(data.netGoodsCost,sum([dispatchedCost,-returnedCost])),businessExpenses=number(data.businessExpenses,derived.businessExpenses),deductedExpenses=number(data.deductedExpenses,scopeShop?0:businessExpenses),received=number(data.received,derived.received);
 const openingResult=number(data.openingResult,number(fallback?.openingResult)),netProfit=sum([received,-netGoodsCost,-deductedExpenses]);
 return {...data,scopeShop,from:data.from||fallback?.from||'Not recorded',through:data.through||fallback?.through||'Not recorded',goods,returns,expenses,payments,missingRegisters,sales,returnCredits,dispatchedCost,returnedCost,netGoodsCost,businessExpenses,deductedExpenses,received,calculationVersion:'collections-v1',invoiceProfit:sum([sales,-returnCredits,-netGoodsCost,-deductedExpenses]),netProfit,openingResult,closingResult:sum([openingResult,netProfit]),priorSavedResult:data.priorSavedResult??fallback?.priorSavedResult??null,openingResultAdjustment:number(data.openingResultAdjustment,number(fallback?.openingResultAdjustment))};
}
export async function monthlyFinancials(month:string,shop:string|null=null,client?:PoolClient,period?:{from:string;to:string;previousResult:number|null}):Promise<MonthlyFinancials>{
 const range=period?{...monthlyRange(month),start:period.from,cutoff:new Date(Date.parse(period.to+'T00:00:00Z')+86400000).toISOString().slice(0,10)}:monthlyRange(month),params=[range.start,range.cutoff,shop];
 const run=async(sql:string,args:unknown[]=params):Promise<QueryResultRow[]>=>client?(await client.query(sql,args)).rows:query(sql,args);
 const [goodsRows,returnRows,expenseRows,paymentRows,openingRows]=await Promise.all([
  run(`SELECT i.invoice_no,to_char(i.issue_date,'YYYY-MM-DD') AS date,s.shop_name,p.name,b.batch_number,ii.quantity,ii.unit_cost,ii.quantity*ii.unit_cost AS total_cost,ii.line_total
   FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN shops s ON s.id=i.shop_id JOIN products p ON p.id=ii.product_id JOIN batches b ON b.id=ii.batch_id
   WHERE i.issue_date >= $1::date AND i.issue_date < $2::date AND ($3::bigint IS NULL OR i.shop_id=$3)
   UNION ALL
   SELECT 'CO-'||o.id,to_char(o.delivered_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD'),o.customer_name,p.name,b.batch_number,ci.quantity,ci.unit_cost,ci.quantity*ci.unit_cost,ci.quantity*ci.retail_price
   FROM customer_orders o JOIN customer_order_items ci ON ci.order_id=o.id JOIN products p ON p.id=ci.product_id JOIN batches b ON b.id=ci.batch_id
   WHERE $3::bigint IS NULL AND o.agent_id IS NULL AND (o.delivered_at AT TIME ZONE 'Asia/Karachi')::date >= $1 AND (o.delivered_at AT TIME ZONE 'Asia/Karachi')::date < $2
   ORDER BY date,invoice_no,name,batch_number`),
  run(`SELECT r.return_no,to_char(r.created_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD') AS date,i.invoice_no,s.shop_name,r.total_credit,
   COALESCE((SELECT SUM(ri.quantity*ii.unit_cost) FROM sales_return_items ri JOIN invoice_items ii ON ii.id=ri.invoice_item_id WHERE ri.return_id=r.id),0) AS reversed_cost
   FROM sales_returns r JOIN invoices i ON i.id=r.invoice_id JOIN shops s ON s.id=r.shop_id
   WHERE (r.created_at AT TIME ZONE 'Asia/Karachi')::date >= $1::date AND (r.created_at AT TIME ZONE 'Asia/Karachi')::date < $2::date AND ($3::bigint IS NULL OR r.shop_id=$3)
   UNION ALL
   SELECT 'CO-'||o.id||'-RETURN',to_char(o.returned_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD'),'CO-'||o.id,o.customer_name,SUM(ci.quantity*ci.retail_price),SUM(ci.quantity*ci.unit_cost)
   FROM customer_orders o JOIN customer_order_items ci ON ci.order_id=o.id
   WHERE $3::bigint IS NULL AND o.agent_id IS NULL AND (o.returned_at AT TIME ZONE 'Asia/Karachi')::date >= $1 AND (o.returned_at AT TIME ZONE 'Asia/Karachi')::date < $2
   GROUP BY o.id ORDER BY date,return_no`),
  run(`SELECT e.id,to_char(e.expense_date,'YYYY-MM-DD') AS date,e.title,e.category,e.note,e.amount,COALESCE(u.full_name,'Not recorded') AS staff
   FROM expenses e LEFT JOIN users u ON u.id=e.created_by WHERE e.expense_date >= $1::date AND e.expense_date < $2::date ORDER BY e.expense_date,e.id`,params.slice(0,2)),
  run(`SELECT p.id::text,p.payment_no,to_char(p.payment_date,'YYYY-MM-DD') AS date,s.shop_name,p.method,p.reference,p.note,p.amount,COALESCE(u.full_name,'Not recorded') AS staff,
   COALESCE((SELECT string_agg(i.invoice_no||' ('||pa.amount::text||')',', ' ORDER BY i.id) FROM payment_allocations pa JOIN invoices i ON i.id=pa.invoice_id WHERE pa.payment_id=p.id),'No allocation') AS invoices
   FROM payments p JOIN shops s ON s.id=p.shop_id LEFT JOIN users u ON u.id=p.created_by WHERE p.payment_date >= $1::date AND p.payment_date < $2::date AND ($3::bigint IS NULL OR p.shop_id=$3)
   UNION ALL
   SELECT 'local-'||p.id,'CO-'||o.id||'-PAY-'||p.id,to_char(p.payment_date,'YYYY-MM-DD'),o.customer_name,p.method,p.reference,p.note,
   CASE WHEN p.kind='COLLECTION' THEN p.amount ELSE -p.amount END,COALESCE(u.full_name,'Not recorded'),'CO-'||o.id
   FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id LEFT JOIN users u ON u.id=p.created_by
   WHERE $3::bigint IS NULL AND o.agent_id IS NULL AND p.payment_date >= $1 AND p.payment_date < $2
   ORDER BY date,payment_no`),
  run(`SELECT
   COALESCE((SELECT SUM(amount) FROM payments WHERE payment_date<$1::date AND ($2::bigint IS NULL OR shop_id=$2)),0)
   -COALESCE((SELECT SUM(ii.quantity*ii.unit_cost) FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.issue_date<$1::date AND ($2::bigint IS NULL OR i.shop_id=$2)),0)
   +COALESCE((SELECT SUM(ri.quantity*ii.unit_cost) FROM sales_return_items ri JOIN invoice_items ii ON ii.id=ri.invoice_item_id JOIN sales_returns r ON r.id=ri.return_id WHERE (r.created_at AT TIME ZONE 'Asia/Karachi')::date<$1::date AND ($2::bigint IS NULL OR r.shop_id=$2)),0)
   +CASE WHEN $2::bigint IS NULL THEN
    COALESCE((SELECT SUM(CASE WHEN p.kind='COLLECTION' THEN p.amount ELSE -p.amount END) FROM customer_order_payments p JOIN customer_orders o ON o.id=p.order_id WHERE o.agent_id IS NULL AND p.payment_date<$1::date),0)
    -COALESCE((SELECT SUM(ci.quantity*ci.unit_cost) FROM customer_order_items ci JOIN customer_orders o ON o.id=ci.order_id
     WHERE o.agent_id IS NULL AND (o.delivered_at AT TIME ZONE 'Asia/Karachi')::date<$1::date
     AND (o.returned_at IS NULL OR (o.returned_at AT TIME ZONE 'Asia/Karachi')::date >= $1::date)),0)
   ELSE 0 END
   -CASE WHEN $2::bigint IS NULL THEN COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date<$1::date),0) ELSE 0 END AS opening_result,
   (SELECT snapshot->'financials'->>'closingResult' FROM public.monthly_closing_documents WHERE month_start=$3::date AND scope_key=COALESCE($2::bigint,0) AND snapshot->'financials'->>'calculationVersion'='collections-v1') AS prior_result`,[range.start,shop,range.previousMonth+'-01']),
 ]);
 const goods=goodsRows.map(g=>({invoice:String(g.invoice_no),date:String(g.date),shop:String(g.shop_name),product:String(g.name),batch:String(g.batch_number),quantity:Number(g.quantity),unitCost:Number(g.unit_cost),totalCost:Number(g.total_cost),sales:Number(g.line_total)}));
 const returns=returnRows.map(r=>({reference:String(r.return_no),date:String(r.date),invoice:String(r.invoice_no),shop:String(r.shop_name),credit:Number(r.total_credit),reversedCost:Number(r.reversed_cost)}));
 const expenses=expenseRows.map(e=>({reference:`EXP-${e.id}`,date:String(e.date),title:String(e.title),category:String(e.category),note:String(e.note||''),staff:String(e.staff),amount:Number(e.amount)}));
 const payments=paymentRows.map(p=>({id:String(p.id),reference:String(p.payment_no),date:String(p.date),shop:String(p.shop_name),method:String(p.method),bankReference:String(p.reference||''),note:String(p.note||''),staff:String(p.staff),amount:Number(p.amount),invoices:String(p.invoices)}));
 const openingResult=Number(openingRows[0]?.opening_result||0),priorSavedResult=period?period.previousResult:openingRows[0]?.prior_result==null?null:Number(openingRows[0].prior_result);
 return collectionClosing({scopeShop:shop,from:range.start,through:period?period.to:range.isComplete?range.end:range.today,goods,returns,expenses,payments,openingResult,priorSavedResult,openingResultAdjustment:priorSavedResult===null?0:sum([openingResult,-priorSavedResult]),...financialTotals(goods,returns,expenses,payments,shop)});
}
