import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {auditFilters,auditReport,changedRows,detailRows,type AuditFilterInput} from '@/lib/audit-report';
export default async function Audit({searchParams}:{searchParams:Promise<AuditFilterInput>}){
 await requireRole('ADMIN');
 const input=await searchParams,f=auditFilters(input);
 const [events,staff,actions,entities]=await Promise.all([
  f.error?Promise.resolve([]):auditReport(f),query('SELECT id,full_name FROM users ORDER BY full_name,id'),
  query("SELECT DISTINCT action FROM public.audit_logs UNION SELECT 'PRICE_CHANGE' ORDER BY action"),
  query("SELECT DISTINCT entity FROM public.audit_logs UNION SELECT 'pricing' ORDER BY entity")]);
 const params=new URLSearchParams(Object.entries(f).filter(([key,value])=>key!=='error'&&Boolean(value)));
 const requested=typeof input.page==='string'&&/^\d+$/.test(input.page)?Number(input.page):1;
 const pages=Math.max(1,Math.ceil(events.length/50)),page=Math.min(pages,Math.max(1,Number.isSafeInteger(requested)?requested:1));
 const visible=events.slice((page-1)*50,page*50);
 const pageLink=(n:number)=>{const p=new URLSearchParams(params);p.set('page',String(n));return `/audit?${p}`;};
 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">SECURITY / TRANSACTION RECORDS</span><h1>Detailed audit report</h1><p>Staff activity, recorded changes, inventory and financial events, and pricing history.</p></div><div className="actions report-download-actions">{!f.error&&(['pdf','docx','xlsx'] as const).map(format=><a key={format} href={`/api/audit/download?${params}&format=${format}`} className={`btn ${format==='pdf'?'primary':'outline'}`}>Download {format==='docx'?'Word':format==='xlsx'?'Excel':'PDF'}</a>)}</div></div>
 <div className="card"><h2>Filter audit activity</h2><form action="/audit" method="get" className="form-grid section-gap">
 <div className="field"><label htmlFor="audit-from">From date</label><input id="audit-from" name="from" type="date" defaultValue={f.from}/></div>
 <div className="field"><label htmlFor="audit-to">To date</label><input id="audit-to" name="to" type="date" defaultValue={f.to}/></div>
 <div className="field"><label htmlFor="audit-actor">Staff member</label><select id="audit-actor" name="actor" defaultValue={f.actor}><option value="">All staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
 <div className="field"><label htmlFor="audit-action">Action</label><select id="audit-action" name="action" defaultValue={f.action}><option value="">All actions</option>{actions.map(a=><option key={a.action}>{a.action}</option>)}</select></div>
 <div className="field"><label htmlFor="audit-entity">Record type</label><select id="audit-entity" name="entity" defaultValue={f.entity}><option value="">All record types</option>{entities.map(e=><option key={e.entity}>{e.entity}</option>)}</select></div>
 <div className="field"><label htmlFor="audit-search">Search activity and details</label><input id="audit-search" name="q" maxLength={200} defaultValue={f.q} placeholder="Invoice number, shop, record ID, or detail"/></div>
 <div className="form-actions"><button className="btn primary">Show audit report</button><Link className="btn outline" href="/audit">Clear filters</Link></div>
 </form><p className="card-sub">Both dates are included in Pakistan time. Downloads include all matching events, across every page.</p></div>
 {f.error?<div className="notice section-gap" role="alert">{f.error}</div>:<><div className="stats-grid section-gap">{[['Total events',events.length],['Operational events',events.filter(e=>e.source==='Operational audit').length],['Pricing events',events.filter(e=>e.source==='Pricing history').length]].map(([label,count])=><div className="card stat" key={label}><div className="stat-top">{label}</div><strong>{count}</strong></div>)}</div>
 <div className="notice section-gap">Only saved audit information can be reported. Missing historical details are marked as unavailable. Pricing and operational logs may record the same change. Passwords and authentication secrets are redacted.</div>
 <div className="card section-gap"><div className="card-header"><h2>Complete activity trail</h2><span className="badge blue">{events.length} events</span></div><div className="table-wrap"><table><thead><tr><th>Event / time (PKT)</th><th>Staff member</th><th>Action</th><th>Record</th><th>Recorded details</th></tr></thead><tbody>{visible.map(e=>{const changes=changedRows(e.details),details=e.details===null||e.details===undefined?[]:detailRows(e.details);return <tr key={e.id}><td><b>{e.id}</b><div className="muted">{e.timestamp}</div></td><td>{e.actor}<div className="muted">{e.role}<br/>{e.email}</div></td><td><span className="badge blue">{e.action}</span><div className="muted">{e.source}</div></td><td>{e.entity}<div className="mono">ID {e.recordId}</div></td><td><details><summary className="closing-detail-title">View full detail{changes.length?` (${changes.length} changed fields)`:''}</summary>{changes.length>0&&<div className="table-wrap section-gap"><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{changes.map(([field,before,after])=><tr key={field}><td>{field}</td><td>{before}</td><td>{after}</td></tr>)}</tbody></table></div>}<dl className="audit-detail-list">{details.length?details.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>):<div><dd>No additional details were saved for this event.</dd></div>}</dl></details></td></tr>;})}</tbody></table>{!events.length&&<div className="empty">No audit events match these filters.</div>}</div><div className="balance-pagination"><span>Page {page} of {pages} · {events.length} matching events</span><div className="actions">{page>1&&<Link className="btn" href={pageLink(page-1)}>Previous</Link>}{page<pages&&<Link className="btn" href={pageLink(page+1)}>Next</Link>}</div></div></div></>}
 </>;
}
