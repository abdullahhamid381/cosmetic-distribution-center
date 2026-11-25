export type ShopBrokerAmounts={total:number|string;paid_total:number|string;credit_total:number|string;broker_pct:number|string;retail_net:number|string};
export type ShopBrokerSplitLine={quantity:number;retail:number;shopPrice:number;companyPrice:number;shopPct:number;brokerPct:number};
export function shopBrokerSplit(lines:ShopBrokerSplitLine[]){
 let retail=0,shopInvoice=0,company=0,shopWeighted=0,brokerWeighted=0;
 for(const line of lines){const base=Math.round(line.retail*100)*line.quantity;retail+=base;shopInvoice+=Math.round(line.shopPrice*100)*line.quantity;company+=Math.round(line.companyPrice*100)*line.quantity;shopWeighted+=base*line.shopPct;brokerWeighted+=base*line.brokerPct;}
 const shopPct=retail?shopWeighted/retail:0,brokerPct=retail?brokerWeighted/retail:0;
 return {retail:retail/100,shopInvoice:shopInvoice/100,company:company/100,shopAmount:(retail-shopInvoice)/100,brokerAmount:(shopInvoice-company)/100,combinedAmount:(retail-company)/100,shopPct,brokerPct,combinedPct:shopPct+brokerPct};
}
export function shopBrokerFinancials(invoice:ShopBrokerAmounts){
 const c=(v:number|string)=>Math.round(Number(v)*100);
 const netInvoice=Math.max(0,c(invoice.total)-c(invoice.credit_total));
 const collected=Math.max(0,Math.min(netInvoice,c(invoice.paid_total)));
 const pending=Math.max(0,netInvoice-collected);
 // Both parties use original retail. Collections release the broker's retail
 // share proportionally; applying the rate to the discounted bill underpays it.
 const retail=Math.max(0,c(invoice.retail_net));
 const allocation=Math.round(retail*Number(invoice.broker_pct)/100);
 const collectionRatio=netInvoice>0?collected/netInvoice:0;
 const earned=Math.round(allocation*collectionRatio);
 return {retail:retail/100,allocation:allocation/100,collectionRatio,netInvoice:netInvoice/100,collected:collected/100,pending:pending/100,earned:earned/100,pendingDeduction:pending/100,balance:(earned-pending)/100,companyCollections:(collected-earned)/100};
}
export function brokerCustomerPending(order:{status:string;retail_total:number|string;shipping_charge:number|string;collected?:number|string}){
 if(['CANCELLED','RETURNED'].includes(order.status))return 0;
 return Math.max(0,Math.round(Number(order.retail_total)*100)+Math.round(Number(order.shipping_charge)*100)-Math.round(Number(order.collected||0)*100))/100;
}
export function brokerCollectionAccount(customerEarned:number,shopInvoices:ShopBrokerAmounts[],paid:number,customerPending=0){
 let shopEarned=0,shopPending=0;
 for(const invoice of shopInvoices){const f=shopBrokerFinancials(invoice);shopEarned+=Math.round(f.earned*100);shopPending+=Math.round(f.pendingDeduction*100);}
 const pendingDeduction=shopPending+Math.round(customerPending*100);
 const earned=Math.round(customerEarned*100)+shopEarned;
 const net=earned-pendingDeduction-Math.round(paid*100);
 return {earned:earned/100,shopEarned:shopEarned/100,shopPending:shopPending/100,customerPending,pendingDeduction:pendingDeduction/100,netBalance:net/100,due:Math.max(0,net)/100,recovery:Math.max(0,-net)/100};
}
