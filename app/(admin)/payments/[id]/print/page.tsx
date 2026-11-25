import {bankSettings} from '@/lib/bank-settings';
import {notFound} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {PaymentReceiptDocument} from '@/components/PaymentReceiptDocument';

export default async function PrintPayment({params}:{params:Promise<{id:string}>}) {
 await requireRole('ADMIN','MANAGER','ACCOUNTS','SALES');
 const {id}=await params;
 if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)notFound();
 const [rows,allocations]=await Promise.all([
  query(`SELECT p.*,to_char(p.payment_date,'DD/MM/YYYY') AS receipt_date,s.shop_name,s.contact_name,s.address,s.city,s.phone,u.full_name AS staff
   FROM payments p JOIN shops s ON s.id=p.shop_id LEFT JOIN users u ON u.id=p.created_by WHERE p.id=$1`,[id]),
  query(`SELECT a.amount,i.invoice_no,i.total,i.total-i.paid_total-i.credit_total AS balance
   FROM payment_allocations a JOIN invoices i ON i.id=a.invoice_id WHERE a.payment_id=$1 ORDER BY i.id`,[id]),
 ]);
 const p=rows[0];if(!p)notFound();
 const bank=await bankSettings();
 return <PaymentReceiptDocument bank={bank} business={{name:process.env.BUSINESS_NAME||'HH MEDICS',address:process.env.BUSINESS_ADDRESS||'Bhakkar, Pakistan',phone:process.env.BUSINESS_PHONE||''}}
 payment={{id:Number(p.id),number:String(p.payment_no||`PAY-${p.id}`),date:p.receipt_date,amount:Number(p.amount),method:p.method,reference:p.reference||'',note:p.note||'',staff:p.staff||'',shop:p.shop_name,contact:p.contact_name||'',address:[p.address,p.city].filter(Boolean).join(', '),phone:p.phone||''}}
 allocations={allocations.map(a=>({number:String(a.invoice_no),amount:Number(a.amount),total:Number(a.total),balance:Number(a.balance)}))}/>;
}
