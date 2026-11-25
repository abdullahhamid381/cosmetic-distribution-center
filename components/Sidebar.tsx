'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
import { BarChart3, CalendarDays, Boxes, ClipboardList, CreditCard, FileText, LayoutDashboard, LogOut, Menu, PackageSearch, Receipt, Settings2, ShieldCheck, ShoppingCart, Store, Trash2, Truck, Users, X } from 'lucide-react';
import {logout} from '@/app/actions';
export const workspaceLinks = [
  {href:'/agent',label:'My Portal',icon:LayoutDashboard,roles:['SALES']},
  {href:'/agent/orders',label:'My Customer Orders',icon:ShoppingCart,roles:['SALES']},
  {href:'/agent/new',label:'Add Customer Order',icon:FileText,roles:['SALES']},
  {href:'/agent/commissions',label:'My Commissions',icon:CreditCard,roles:['SALES']},
  {href:'/agent/profile',label:'My Profile & Password',icon:Users,roles:['SALES']},
  {href:'/operations',label:'Operations Center',icon:BarChart3,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/field',label:'Field Sales',icon:ClipboardList,roles:['FIELD_SALES','SALES','ADMIN','MANAGER']},
  {href:'/field/access',label:'Field Sales Shop Access',icon:ShieldCheck,roles:['ADMIN','MANAGER']},
  {href:'/field/collections',label:'Field Collections',icon:Receipt,roles:['ADMIN','MANAGER']},
  {href:'/dashboard',label:'Dashboard',icon:LayoutDashboard,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/products',label:'Products & Prices',icon:Boxes,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/inventory',label:'Warehouse Stock',icon:PackageSearch,roles:['ADMIN','MANAGER','WAREHOUSE']},
  {href:'/shops',label:'Shops & Ledgers',icon:Store,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/sales/new',label:'New Distribution',icon:ShoppingCart,roles:['ADMIN','MANAGER']},
  {href:'/local-sales',label:'Local Customer Sales',icon:Receipt,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/sales-team',label:'Sales Department',icon:Users,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/deliveries',label:'Deliveries',icon:Truck,roles:['ADMIN','MANAGER','WAREHOUSE','DELIVERY']},
  {href:'/invoices',label:'Invoices',icon:FileText,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/trash',label:'Trash',icon:Trash2,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/payments',label:'Payments & Dues',icon:CreditCard,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/expenses',label:'Expenses',icon:Receipt,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/reports',label:'Reports',icon:BarChart3,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/monthly-closing',label:'Monthly Closing',icon:CalendarDays,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/balance',label:'Balance & Transactions',icon:CreditCard,roles:['ADMIN','MANAGER','ACCOUNTS']},
  {href:'/staff',label:'Staff & Access',icon:Users,roles:['ADMIN']},
  {href:'/settings/bank',label:'Bank Details & QR',icon:Settings2,roles:['ADMIN']},
  {href:'/audit',label:'Audit Trail',icon:ShieldCheck,roles:['ADMIN']},
];
export const workspaceGroups = [
  {id:'portal',title:'My Sales Portal',paths:['/agent','/agent/orders','/agent/new','/agent/commissions','/agent/profile']},
  {id:'overview',title:'Overview',paths:['/dashboard','/operations']},
  {id:'inventory',title:'Inventory Management',paths:['/products','/inventory']},
  {id:'sales',title:'Sales & Distribution',paths:['/field','/field/access','/field/collections','/sales/new','/local-sales','/deliveries','/invoices']},
  {id:'network',title:'Distribution Network',paths:['/shops','/sales-team']},
  {id:'finance',title:'Finance & Accounts',paths:['/payments','/expenses','/balance','/monthly-closing']},
  {id:'administration',title:'Administration',paths:['/reports','/trash','/staff','/settings/bank','/audit']},
];

export function Sidebar({name,role}:{name:string;role:string}) {
 const path=usePathname();
 const [open,setOpen]=useState(false);
 return <aside className="sidebar no-print"><Link href="/" className="logo sidebar-brand" aria-label="HH Medics home"><span className="sidebar-brand-mark" aria-hidden="true">HH</span>
   <span className="sidebar-brand-type"><strong>HH MEDICS</strong><span className="sidebar-brand-caption">Distribution Center</span></span></Link>
   <button className="mobile-menu-toggle" type="button" aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(!open)}>{open?'Close menu':'Workspace menu'} {open ? <X size={15} aria-hidden="true"/> : <Menu size={15} aria-hidden="true"/>}</button>
   <nav id="workspace-navigation" aria-label="Workspace" className={`nav-list ${open?'is-open':''}`}>{workspaceGroups.map(group=>{const items=workspaceLinks.filter(l=>group.paths.includes(l.href)&&l.roles.includes(role));return items.length?<div className="nav-group" key={group.id}><div className="menu-caption">{group.title}</div>{items.map(l=>{const active=path===l.href||(!['/dashboard','/agent','/field'].includes(l.href)&&path.startsWith(l.href+'/'));return <Link key={l.href} href={l.href} onClick={()=>setOpen(false)} aria-label={l.label} aria-current={active?'page':undefined} className={`nav-link ${active?'active':''}`}><l.icon size={20}/><span>{l.label}</span></Link>})}</div>:null})}</nav>
   <div className="sidebar-bottom"><div className="avatar">{name?.slice(0,1).toUpperCase()}</div><div className="profile"><b>{name}</b><span>{role}</span></div><form action={logout}><button title="Sign out" className="icon-button" type="submit"><LogOut size={17}/></button></form></div>
 </aside>;
}
