export function reportRoi(input:{sales:number;gross:number;expenses:number;pending:number;brokerFull:number;brokerReleased:number}){
 const cents=(n:number)=>Math.round(n*100);
 const productCost=Math.max(0,cents(input.sales)-cents(input.gross));
 const investment=productCost+cents(input.expenses);
 const expected=cents(input.gross)-cents(input.expenses)-cents(input.brokerFull);
 const received=cents(input.gross)-cents(input.expenses)-cents(input.pending)-cents(input.brokerReleased);
 const roi=(profit:number)=>investment>0?Math.round(profit/investment*10000)/100:null;
 return {productCost:productCost/100,investment:investment/100,expectedProfit:expected/100,receivedProfit:received/100,expectedRoi:roi(expected),receivedRoi:roi(received)};
}
export function roiLabel(value:number|null){return value===null?'N/A':value.toFixed(2)+'%';}
