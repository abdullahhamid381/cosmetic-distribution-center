export function invoiceDiscountSummary(items:{discount_pct:number|string}[],subtotal:number|string,discountTotal:number|string){
 const rates=items.map(item=>Number(item.discount_pct));
 const mixed=rates.length>1&&rates.some(rate=>Math.round(rate*100)!==Math.round(rates[0]*100));
 const base=Number(subtotal),discount=Number(discountTotal);
 if(rates.length&&!mixed)return {percentage:rates[0].toFixed(2)+'%',mixed:false};
 if(base>0&&Number.isFinite(base)&&Number.isFinite(discount))return {percentage:(discount/base*100).toFixed(2)+(mixed?'% overall':'%'),mixed};
 return {percentage:mixed?'varies by item':'0.00%',mixed};
}
