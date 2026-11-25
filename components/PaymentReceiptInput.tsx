export function PaymentReceiptInput({id="payment-receipt",required=false}:{id?:string;required?:boolean}={}) {
 return <div className="field span-2"><label htmlFor={id}>Payment receipt {required?'*':'(optional)'}</label><input id={id} required={required} type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf"/><small>Attach a bank slip, transfer screenshot, or receipt. PDF, JPG, PNG, or WebP; up to 5 MB. Uploading a new file replaces the existing receipt.</small></div>;
}
