import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {operationsData} from '@/lib/operations';
import {OperationsCenter} from '@/components/OperationsCenter';
export default async function OperationsPage(){
 await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const data=await operationsData();
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">Business intelligence</span><h1>Operations Center</h1><p>Turn outstanding payments, stock demand, and expiry risk into daily priorities.</p></div><Link className="btn" href="/reports">Financial reports →</Link></div><div className="ops-banner"><div><span className="eyebrow">Your daily briefing</span><h2>Stay ahead of what needs attention.</h2><p>{data.collections.length} overdue invoices · {data.reorder.length} products to review · {data.expiry.length} batches nearing or past expiry</p></div><span className="badge">Live database insights</span></div><h2>Receivables aging</h2><p className="card-sub">Unpaid invoice balances after payments and credits, grouped by days overdue. Business dates use Asia/Karachi.</p><OperationsCenter data={data}/></>;
}
