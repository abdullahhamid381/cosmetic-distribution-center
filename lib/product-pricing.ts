export function tradeFromRetail(retail:number,percentage:number) {
 if(!Number.isFinite(retail)||retail<0)throw new Error('Enter a valid retail price.');
 if(!Number.isFinite(percentage)||percentage<0||percentage>100)throw new Error('Trade discount percentage must be between 0 and 100.');
 return Math.round((retail*(1-percentage/100)+Number.EPSILON)*100)/100;
}
export function effectiveShopDiscount(first:number,second:number) {
 return Math.round((first+second-first*second/100)*100)/100;
}

export function dispatchPricing(retail:number,first:number,second:number,broker:number) {
 const afterFirst=tradeFromRetail(retail,first);
 const price=tradeFromRetail(afterFirst,second);
 const companyPrice=second===0
  ?tradeFromRetail(retail,Math.round((first+broker)*100)/100)
  :Math.max(0,Math.round(price*100)-Math.round(retail*broker))/100;
 return {afterFirst,price,companyPrice};
}
export function productTradePrice(retail:number,trade:unknown,percentage:unknown) {
 if(percentage!==null&&percentage!==undefined&&String(percentage).trim()!=='')return tradeFromRetail(retail,Number(percentage));
 if(trade===null||trade===undefined||String(trade).trim()===''||!Number.isFinite(Number(trade))||Number(trade)<0)throw new Error('Enter a valid trade price.');
 return Math.round((Number(trade)+Number.EPSILON)*100)/100;
}
