import type {PoolClient} from 'pg';

export async function nextStoreInvoiceNumber(tx:Pick<PoolClient,'query'>,shopId:number){
 const [shop]=(await tx.query('SELECT store_code FROM shops WHERE id=$1 FOR UPDATE',[shopId])).rows;
 if(!shop)throw new Error('Store not found.');
 const prefix=`${shop.store_code}-INV-`;
 // Search by number prefix because an edited invoice can belong to a different shop.
 const {rows}=await tx.query('SELECT invoice_no FROM invoices WHERE starts_with(invoice_no,$1)',[prefix]);
 const used=new Set(rows.map(row=>row.invoice_no));
 let sequence=1;
 while(used.has(prefix+String(sequence).padStart(4,'0')))sequence++;
 // Preserve the high-water mark used by the legacy invoice conversion script.
 await tx.query('UPDATE shops SET invoice_sequence=GREATEST(invoice_sequence,$2) WHERE id=$1',[shopId,sequence]);
 return prefix+String(sequence).padStart(4,'0');
}
