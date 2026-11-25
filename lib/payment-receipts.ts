import type {PoolClient} from 'pg';

export const MAX_RECEIPT_BYTES=5*1024*1024;
export async function readPaymentReceipt(form:FormData) {
 const file=form.get('receipt');
 if(!file||typeof file==='string'||file.size===0)return null;
 if(file.size>MAX_RECEIPT_BYTES)throw new Error('Payment receipt must be 5 MB or smaller.');
 const data=Buffer.from(await file.arrayBuffer());
 let mime='';
 if(data.subarray(0,5).toString()==='%PDF-')mime='application/pdf';
 else if(data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
 else if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)mime='image/jpeg';
 else if(data.length>=12&&data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP')mime='image/webp';
 if(!mime)throw new Error('Upload a PDF, JPG, PNG, or WebP payment receipt.');
 const name=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200)||'payment-receipt';
 return {name,mime,data};
}
export async function savePaymentReceipt(tx:PoolClient,paymentId:number,receipt:NonNullable<Awaited<ReturnType<typeof readPaymentReceipt>>>,userId:number) {
 await tx.query(`INSERT INTO payment_receipts(payment_id,file_name,content_type,file_data,uploaded_by)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(payment_id) DO UPDATE SET
 file_name=EXCLUDED.file_name,content_type=EXCLUDED.content_type,file_data=EXCLUDED.file_data,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=NOW()`,[paymentId,receipt.name,receipt.mime,receipt.data,userId]);
}
