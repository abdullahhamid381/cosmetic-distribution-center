import {requireRole} from '@/lib/auth';
import {bankSettings} from '@/lib/bank-settings';
import {BankDetails} from '@/components/BankDetails';
import {saveBankSettings} from '@/app/bank-actions';
export default async function BankSettings({searchParams}:{searchParams:Promise<{saved?:string;error?:string}>}) {
 await requireRole('ADMIN');
 const bank=await bankSettings(),status=await searchParams;
 return <><div className="page-title"><span className="eyebrow">SETTINGS / PAYMENT INSTRUCTIONS</span><h1>Bank details & QR code</h1><p>These details appear on sales invoices, balance payment requests, and payment receipts.</p></div>
 {status.saved&&<div className="notice section-gap">Bank details saved.</div>}{status.error&&<div className="notice section-gap" role="alert">{status.error}</div>}
 <div className="card section-gap"><form action={saveBankSettings} className="form-grid">{[['bankName','Bank name'],['accountTitle','Account title'],['accountNumber','Account number'],['iban','IBAN'],['branchCode','Branch code']].map(([name,label])=><div className="field" key={name}><label htmlFor={name}>{label}</label><input id={name} name={name} maxLength={200} defaultValue={bank[name as keyof typeof bank]}/></div>)}
 <div className="field"><label htmlFor="bank-qr">Bank-issued payment QR image</label><input id="bank-qr" name="qr" type="file" accept="image/png,image/jpeg,image/webp"/><small>Upload your bank's payment QR as PNG, JPG, or WebP, up to 2 MB. It is printed as provided; account details alone do not generate a bank payment QR.</small></div>
 {bank.qrDataUrl&&<div className="field"><label><input name="remove_qr" type="checkbox"/> Remove current QR image</label></div>}
 <div className="field span-2"><button className="btn primary">Save bank details</button></div></form></div><div className="card section-gap"><h2>Print preview</h2><BankDetails bank={bank}/></div></>;
}
