export type DispatchCostBasis='FULL'|'MANUFACTURING'|'BOX'|'BATCH';
export function dispatchCost(manufacturing:number,box:number,basis:DispatchCostBasis,batch=manufacturing){
 if(![manufacturing,box,batch].every(n=>Number.isFinite(n)&&n>=0))throw new Error('Product costs must be valid non-negative amounts.');
 const m=Math.round(manufacturing*100),b=Math.round(box*100);
 switch(basis){case 'FULL':return (m+b)/100;case 'MANUFACTURING':return m/100;case 'BOX':return b/100;case 'BATCH':return Math.round(batch*100)/100;default:throw new Error('Choose full cost, manufacturing cost or box cost.');}
}
export const dispatchCostLabels:Record<DispatchCostBasis,string>={FULL:'Full cost (manufacturing + box)',MANUFACTURING:'Manufacturing cost only',BOX:'Box cost only',BATCH:'Original batch cost (legacy)'};
