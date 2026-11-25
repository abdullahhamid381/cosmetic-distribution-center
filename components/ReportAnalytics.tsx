import {ChartNoAxesCombined, ArrowUpRight, CircleHelp} from 'lucide-react';
import {money} from '@/lib/utils';

export function ReportAnalytics({months,totals}:{months:{month:string;original:number}[];totals:{original:number;received:number;returns:number;remaining:number}}){
 const recent=[...months].sort((a,b)=>a.month.localeCompare(b.month)).slice(-6);
 const max=Math.max(1,...recent.map(m=>m.original));
 const denominator=Math.max(0,totals.original);
 const received=denominator?Math.min(100,Math.max(0,totals.received/denominator*100)):0;
 const credited=denominator?Math.min(100-received,Math.max(0,totals.returns/denominator*100)):0;
 return <div className="report-analytics">
  <section className="card revenue-panel"><div className="analytics-heading"><div><span className="panel-kicker">SALES PERFORMANCE</span><h2>Invoice activity</h2></div><span className="chart-legend"><i/> Invoiced sales</span></div>
   {recent.length?<div className="revenue-chart" role="img" aria-label="Monthly invoiced sales"><div className="chart-guides"><span>{money(max)}</span><span>{money(max/2)}</span><span>0</span></div><div className="revenue-bars">{recent.map(m=><div className="revenue-column" key={m.month}><div className="revenue-bar" style={{height:`${Math.max(2,m.original/max*100)}%`}} title={`${m.month}: ${money(m.original)}`}/><span>{new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'})}</span></div>)}</div></div>:<div className="chart-empty"><ChartNoAxesCombined size={32} strokeWidth={1.3}/><b>Your sales story starts here</b><p>Monthly activity will appear when invoices match your filters.</p></div>}
   <div className="chart-footnote"><CircleHelp size={13}/> Last six months with invoices in the selected range.</div>
  </section>
  <section className="card collection-panel"><div className="analytics-heading"><div><span className="panel-kicker">COLLECTION HEALTH</span><h2>Payment breakdown</h2></div><ArrowUpRight size={18}/></div><div className="collection-ring" style={{background:`conic-gradient(var(--ui-teal, #297f78) 0% ${received}%,var(--ui-blue, #4e68bd) ${received}% ${received+credited}%,var(--ui-border, #dfe5ee) ${received+credited}% 100%)`}} role="img" aria-label={denominator?`${received.toFixed(1)} percent of invoice value collected`:'No invoice value in this selection'}><div><strong>{denominator?`${Math.round(received)}%`:'—'}</strong><span>{denominator?'collected':'No invoices'}</span></div></div><div className="collection-key">{[['Received',totals.received,'received'],['Return credits',totals.returns,'credits'],['Outstanding',totals.remaining,'outstanding']].map(([label,value,key])=><div key={String(key)}><span><i className={String(key)}/>{label}</span><b>{money(Number(value))}</b></div>)}</div></section>
 </div>;
}
