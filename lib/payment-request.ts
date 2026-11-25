export function validRequestedPayment(value:string,balance:number) {
 if(!/^\d+(\.\d{1,2})?$/.test(value))return false;
 const amount=Number(value),requestedCents=Math.round(amount*100),balanceCents=Math.round(balance*100);
 return Number.isSafeInteger(requestedCents)&&Number.isSafeInteger(balanceCents)&&requestedCents>0&&requestedCents<=balanceCents;
}
