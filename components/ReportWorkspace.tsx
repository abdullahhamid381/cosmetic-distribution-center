'use client';

import {useState, type ReactNode} from 'react';
import {BarChart3, FileText, Wallet, RotateCcw, TrendingUp, Boxes, Receipt} from 'lucide-react';

const views=[{id:'overview',label:'Overview',icon:BarChart3},{id:'invoices',label:'Invoices',icon:FileText},{id:'payments',label:'Payments',icon:Wallet},{id:'returns',label:'Returns',icon:RotateCcw},{id:'expenses',label:'Expenses',icon:Receipt},{id:'profit',label:'Profitability',icon:TrendingUp},{id:'products',label:'Products',icon:Boxes}];

export function ReportWorkspace({children,initialView='overview'}:{children:ReactNode;initialView?:string}){
 const [view,setView]=useState(initialView);
 return <div className="report-workspace" data-view={view}>
  <div className="report-view-tabs no-print" role="tablist" aria-label="Business report views">{views.map(({id,label,icon:Icon})=><button key={id} type="button" role="tab" aria-selected={view===id} aria-controls={`report-panel-${id}`} id={`report-tab-${id}`} tabIndex={view===id?0:-1} onClick={()=>setView(id)} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=views.findIndex(v=>v.id===id);const next=e.key==='Home'?0:e.key==='End'?views.length-1:(index+(e.key==='ArrowRight'?1:-1)+views.length)%views.length;setView(views[next].id);document.getElementById(`report-tab-${views[next].id}`)?.focus();}}><Icon size={16}/>{label}</button>)}</div>
  {children}
 </div>;
}
