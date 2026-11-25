'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,ShoppingCart,Users,PhoneCall,Wallet,BarChart3} from 'lucide-react';
const links=[['/sales-team','Overview',LayoutDashboard],['/sales-team/orders','Orders',ShoppingCart],['/sales-team/agents','Agents & targets',Users],['/sales-team/brokers','Brokers',Users],['/sales-team/shop-brokers','Shop broker ledger',Wallet],['/sales-team/follow-ups','Follow-ups',PhoneCall],['/sales-team/commissions','Commissions',Wallet],['/sales-team/reports','Reports',BarChart3]] as const;
export function SalesDepartmentNav(){const path=usePathname();return <nav aria-label="Sales department" className="sales-dept-nav no-print">{links.map(([href,label,Icon])=><Link key={href} href={href} aria-current={(href==='/sales-team'?path===href:path.startsWith(href))?'page':undefined}><Icon size={17}/>{label}</Link>)}</nav>;}
