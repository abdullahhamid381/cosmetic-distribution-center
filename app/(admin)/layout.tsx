import {Sidebar} from '@/components/Sidebar';
import {requireUser} from '@/lib/auth';
import {WorkspaceHeader} from '@/components/WorkspaceHeader';
import {WorkspaceLiveRefresh} from '@/components/WorkspaceLiveRefresh';
import {businessBalance,financeRoles} from '@/lib/business-balance';
import {money} from '@/lib/utils';
import Link from 'next/link';
import {Suspense} from 'react';
export const dynamic = 'force-dynamic';

async function BalanceAmount(){
 const {balance}=await businessBalance();
 return <strong className={Number(balance)<0?'negative':''}>{money(balance)}</strong>;
}

export default async function AdminLayout({children}:{children:React.ReactNode}){
 const u=await requireUser();
 const balance=financeRoles.includes(u.role)?<Link href="/balance" className="navbar-balance" title="View received payments, expenses, and who recorded them"><span>Your Balance</span><Suspense fallback={<strong aria-label="Loading balance">…</strong>}><BalanceAmount/></Suspense></Link>:undefined;
 return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><Sidebar name={u.name} role={u.role}/><div className="app-main"><WorkspaceHeader name={u.name} role={u.role} balance={balance}/><WorkspaceLiveRefresh/><main id="main-content" className="page">{children}</main><footer className="main-footer no-print"><span>HH MEDICS <span className="footer-dot">&middot;</span> Distribution Center</span><span>&copy; {new Date().getFullYear()} HH MEDICS. All rights reserved.</span></footer></div></div>;
}
