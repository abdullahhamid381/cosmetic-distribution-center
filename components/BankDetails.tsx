import type {BankDetails as Details} from '@/lib/bank-types';
export function BankDetails({bank,compact=false}:{bank:Details;compact?:boolean}) {
 if(compact){
  const fields=[['Bank',bank.bankName],['Account title',bank.accountTitle],['Account number',bank.accountNumber],['IBAN',bank.iban],['Branch code',bank.branchCode]].filter(([,value])=>value.trim());
  if(!fields.length&&!bank.qrDataUrl)return null;
  return <section className="bank-details">
   <div><h2>Bank payment</h2><dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
   {bank.qrDataUrl&&<div className="bank-qr"><img src={bank.qrDataUrl} alt="Bank payment QR code" width={160} height={160}/></div>}
  </section>;
 }
 return <section className="bank-details section-gap"><div><h2>Bank payment details</h2><dl>{[['Bank',bank.bankName],['Account title',bank.accountTitle],['Account number',bank.accountNumber],['IBAN',bank.iban],['Branch code',bank.branchCode]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not configured'}</dd></div>)}</dl></div><div className="bank-qr">{bank.qrDataUrl?<><img src={bank.qrDataUrl} alt="Bank payment QR code" width={160} height={160}/><p>Scan using your banking app</p></>:<p>Bank QR code not configured</p>}</div></section>;
}
