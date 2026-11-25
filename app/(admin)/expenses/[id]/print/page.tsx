import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {money,formatDate} from '@/lib/utils';
import {BrandLogo} from '@/components/BrandLogo';
import {PrintButton} from '@/components/PrintButton';

export default async function ExpenseVoucher({params}:{params:Promise<{id:string}>}){
 await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const {id}=await params;
 if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)notFound();
 const [expense]=await query(`SELECT e.*,to_char(e.expense_date,'YYYY-MM-DD') AS expense_date,
 COALESCE(u.full_name,'Not recorded') AS recorded_by FROM expenses e LEFT JOIN users u ON u.id=e.created_by WHERE e.id=$1`,[id]);
 if(!expense)notFound();
 return <><div className="print-actions no-print"><Link className="btn outline" href="/balance?kind=expense">Back to transactions</Link><PrintButton/></div>
 <article className="print-document expense-voucher"><div className="invoice-head"><div><BrandLogo className="document-brand-logo"/><p>HH MEDICS · Distribution Center</p></div><div className="align-right"><span className="eyebrow">OPERATING EXPENSE</span><h1>Expense Voucher</h1><b>EXP-{expense.id}</b></div></div>
 <div className="invoice-summary"><div><span className="eyebrow">EXPENSE DETAILS</span><h2>{expense.title}</h2><p>Category: <b>{expense.category}</b></p></div><div><span className="eyebrow">RECORD DETAILS</span><p>Date: <b>{formatDate(expense.expense_date)}</b><br/>Recorded by: <b>{expense.recorded_by}</b><br/>Reference: <b>EXP-{expense.id}</b></p></div></div>
 <div className="invoice-total"><div className="final"><span>Expense amount</span><b>{money(expense.amount)}</b></div></div>
 <section className="section-gap"><h2>Notes / supporting references</h2><p className="voucher-note">{expense.note||'No notes or external receipt reference recorded.'}</p></section>
 <p className="card-sub section-gap">This voucher documents the expense recorded in HH MEDICS. It is an internal expense record, not a supplier invoice or an uploaded receipt.</p>
 <div className="footer-print"><span>Prepared by: {expense.recorded_by}</span><span>Approved by: ___________________</span></div>
 </article></>;
}
