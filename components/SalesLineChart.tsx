import {ChartNoAxesCombined} from 'lucide-react';
import {money} from '@/lib/utils';
export function SalesLineChart({data}:{data:{month:string;value:number}[]}){
 const max=Math.max(1,...data.map(p=>p.value));
 const min=Math.min(0,...data.map(p=>p.value));
 const y=(value:number)=>210-(value-min)/(max-min)*180;
 const points=data.map((p,i)=>({x:58+i*430/Math.max(1,data.length-1),y:y(p.value),...p}));
 const line=points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');
 return <div className="sales-line-chart">{data.length?<svg viewBox="0 0 520 264" role="img" aria-label="Monthly net invoiced sales in Pakistani rupees"><defs><linearGradient id="sales-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6452ff" stopOpacity=".18"/><stop offset="100%" stopColor="#6452ff" stopOpacity="0"/></linearGradient><linearGradient id="sales-stroke"><stop stopColor="#b9b0ff"/><stop offset="100%" stopColor="#5742ff"/></linearGradient></defs>{[0,.33,.66,1].map(n=><g key={n}><line x1="58" y1={30+180*n} x2="488" y2={30+180*n} stroke="#e9e9ef"/><text x="0" y={34+180*n} fill="#8a92a4" fontSize="10">{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(max-(max-min)*n)}</text></g>)}<path d={`${line} L ${points.at(-1)!.x} 210 L ${points[0].x} 210 Z`} fill="url(#sales-fill)"/><path d={line} fill="none" stroke="url(#sales-stroke)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"/>{points.map(p=><g key={p.month}><circle cx={p.x} cy={p.y} r="4" fill="#6452ff" stroke="white" strokeWidth="2"><title>{p.month}: {money(p.value)}</title></circle><text x={p.x} y="244" textAnchor="middle" fill="#8a92a4" fontSize="11">{new Date(`${p.month}-01T12:00:00Z`).toLocaleDateString('en',{month:'short',timeZone:'UTC'})}</text></g>)}</svg>:<div className="chart-empty"><ChartNoAxesCombined size={34}/><b>No sales activity yet</b><p>Your monthly sales chart will appear after your first invoice.</p></div>}</div>;
}
