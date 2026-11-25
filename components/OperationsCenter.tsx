'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Download,Search,ArrowUpRight} from 'lucide-react';
import {money} from '@/lib/utils';

type Row=Record<string,string|number|null>;
type Data={aging:Row;reorder:Row[];expiry:Row[];collections:Row[]};
const tabs=['Collections','Reorder planner','Expiry watch'] as const;
export function OperationsCenter({data}: {data:Data}) {
 const [tab,setTab]=useState<typeof tabs[number]>('Collections');
 const [search,setSearch]=useState('');
 const source=tab==='Collections'?data.collections:tab==='Reorder planner'?data.reorder:data.expiry;
 const columns=tab==='Collections'?['invoice_no','shop_name','phone','due_date','days','balance']:tab==='Reorder planner'?['sku','name','available','sold30','min_stock','suggested']:['name','batch_number','warehouse','expiry_date','days','quantity_on_hand','value'];
 const labels:Record<string,string>={invoice_no:'Invoice',shop_name:'Customer',phone:'Phone',due_date:'Due date',days:tab==='Expiry watch'?'Days to expiry':'Days overdue',balance:'Outstanding',sku:'SKU',name:'Product',available:'Usable units',sold30:'Sold / 30 days',min_stock:'Minimum',suggested:'Suggested order',batch_number:'Batch',warehouse:'Warehouse',expiry_date:'Expiry',quantity_on_hand:'Units',value:'Cost at risk'};
 const rows=source.filter(r=>columns.some(k=>String(r[k]??'').toLowerCase().includes(search.toLowerCase())));
 function exportCsv(){
  const cell=(v:unknown)=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
  const csv=[columns.map(k=>cell(labels[k])).join(','),...rows.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=tab.toLowerCase().replaceAll(' ','-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <><div className="ops-aging">{[['current','Current'],['days30','1–30 days'],['days60','31–60 days'],['days90','61–90 days'],['older','Over 90 days']].map(([key,label])=><div key={key}><span>{label}</span><strong>{money(data.aging[key])}</strong></div>)}</div>
 <div className="card section-gap"><div className="ops-toolbar"><div className="ops-tabs" role="group" aria-label="Operational view">{tabs.map(t=><button type="button" key={t} aria-pressed={tab===t} onClick={()=>{setTab(t);setSearch('')}}>{t}<span>{(t==='Collections'?data.collections:t==='Reorder planner'?data.reorder:data.expiry).length}</span></button>)}</div><button className="btn" onClick={exportCsv}><Download size={16}/> Export CSV</button></div>
 <p className="card-sub">{tab==='Collections'?'Oldest overdue invoices first. Open an invoice to review balances and request payment.':tab==='Reorder planner'?'Suggestions target the greater of minimum stock or 30 days of recent sales. Expired stock is excluded; review supplier lead times before ordering.':'Batches expiring within 90 days, including expired stock. Negative days indicate an expired batch.'}</p>
 <label className="ops-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter this view…" aria-label="Filter operational records"/></label>
 <div className="table-wrap"><table><thead><tr>{columns.map(k=><th key={k}>{labels[k]}</th>)}{tab==='Collections'&&<th>Review</th>}</tr></thead><tbody>{rows.map(r=><tr key={String(r.id)}>{columns.map(k=><td key={k}>{['balance','value'].includes(k)?money(r[k]):k==='suggested'?Math.max(0,Number(r[k])):String(r[k]??'—')}</td>)}{tab==='Collections'&&<td><Link className="btn" href={`/invoices/${r.id}`} aria-label={`Open invoice ${r.invoice_no}`}><ArrowUpRight size={16}/> Open</Link></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">{search?'No matching records.':'All clear. Records needing attention will appear here as you use the system.'}</div>}</div><p className="card-sub">{rows.length} of {source.length} records · Export includes the filtered view.</p></div></>;
}
