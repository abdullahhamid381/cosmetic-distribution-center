import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {bankSettings} from '@/lib/bank-settings';
import {BalancePaymentRequest} from '@/components/BalancePaymentRequest';

export default async function RequestPayment({params}:{params:Promise<{id:string}>}) {
 await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const {id}=await params;if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)notFound();
 const [rows,bank]=await Promise.all([query(`SELECT i.*,to_char(i.issue_date,'YYYY-MM-DD') AS issued,to_char(i.due_date,'YYYY-MM-DD') AS due,
  s.shop_name,s.contact_name,s.address,s.city,s.phone FROM invoices i JOIN shops s ON s.id=i.shop_id WHERE i.id=$1`,[id]),bankSettings()]);
 const i=rows[0];if(!i)notFound();
 const balance=Math.round((Number(i.total)-Number(i.paid_total)-Number(i.credit_total))*100)/100;
 if(balance<=0)return <div className="card"><h1>This invoice is settled</h1><p>No payment is due.</p><Link className="btn" href={`/invoices/${id}`}>Back to invoice</Link></div>;
 return <BalancePaymentRequest bank={bank} business={{name:process.env.BUSINESS_NAME||'HH MEDICS',address:process.env.BUSINESS_ADDRESS||'Bhakkar, Pakistan',phone:process.env.BUSINESS_PHONE||''}} today={new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Karachi'})}
 invoice={{id:Number(i.id),number:i.invoice_no,shop:i.shop_name,contact:i.contact_name||'',address:[i.address,i.city].filter(Boolean).join(', '),phone:i.phone||'',issued:i.issued,due:i.due,total:Number(i.total),paid:Number(i.paid_total),credits:Number(i.credit_total),balance}}/>;
}
