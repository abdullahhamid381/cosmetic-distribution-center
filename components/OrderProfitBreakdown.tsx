'use client';
import {useEffect,useRef,useState} from 'react';
import {orderProfitPreview,orderStatuses,type OrderProfitInput} from '@/lib/sales-team';
import {money} from '@/lib/utils';
export function OrderProfitBreakdown({initial,agentName,brokerName}:{initial:OrderProfitInput;agentName:string;brokerName?:string|null}){
 const container=useRef<HTMLDivElement>(null);
 const [values,setValues]=useState(initial),[valid,setValid]=useState(true),[brokerLabel,setBrokerLabel]=useState(brokerName||'No broker selected');
 useEffect(()=>{
  const form=container.current?.closest('form');
  if(!form){setValues(initial);setBrokerLabel(brokerName||'No broker selected');return;}
  const update=()=>{
   const next={...initial};let complete=true;
   for(const name of ['shipping_charge','courier_cost','shipping_cost','return_cost','commission_pct','broker_pct'] as const){
    const field=form.elements.namedItem(name) as HTMLInputElement|null;if(!field)continue;
    if(field.value.trim()===''||!Number.isFinite(Number(field.value))||Number(field.value)<0||((name==='commission_pct'||name==='broker_pct')&&Number(field.value)>100)){complete=false;continue;}
    next[name]=field.value;
   }
   const status=form.elements.namedItem('status') as HTMLSelectElement|null;
   if(status&&orderStatuses.some(s=>s===status.value))next.status=status.value;
   const broker=form.elements.namedItem('broker_id') as HTMLSelectElement|null;
   if(broker){next.broker_id=broker.value||null;setBrokerLabel(broker.value?broker.selectedOptions[0]?.text||'Selected broker':'No broker selected');}
   const basis=form.elements.namedItem('commission_basis') as HTMLSelectElement|null;
   if(basis)next.commission_basis=basis.value;
   if(Number(next.commission_pct)+(next.broker_id?Number(next.broker_pct??10):0)>100)complete=false;
   setValues(next);setValid(complete);
  };
  update();form.addEventListener('input',update);form.addEventListener('change',update);
  return ()=>{form.removeEventListener('input',update);form.removeEventListener('change',update);};
 },[initial,brokerName]);
 const totals=orderProfitPreview(values),closed=['RETURNED','CANCELLED'].includes(values.status),retail=values.commission_basis==='RETAIL',baseLabel=retail?'retail product total':'positive profit (legacy)';
 const salesPct=Number(values.commission_pct).toFixed(2),brokerPct=Number(values.broker_pct??10).toFixed(2);
 return <div ref={container} className="field span-2 order-profit-breakdown" aria-label="Order profit after all costs"><div className="agent-card-header"><h3>Profit after all costs & agent shares</h3><span className={'badge '+(totals.estimated?'pending':'blue')}>{totals.estimated?'Estimated on delivery':closed?'Closed order calculation':'Delivered order calculation'}</span></div>
 <p className="compact-note">Sales agent: <b>{agentName}</b> · <b>{salesPct}% of {baseLabel}</b><br/>Broker: <b>{brokerLabel}</b>{values.broker_id&&<> · <b>{brokerPct}% of {baseLabel}</b></>}</p>
 {!valid?<p className="warning-note" role="status">Enter valid costs and percentages from 0 to 100. Combined agent percentages cannot exceed 100%.</p>:<><dl className="profit-cost-rows"><div><dt>Retail product total{retail?' (commission base, excludes shipping)':''}</dt><dd>{money(closed?0:values.retail_total)}</dd></div><div><dt>{closed?'Sales revenue after reversal':'Retail sales + shipping charged to customer'}</dt><dd>{money(totals.revenue)}</dd></div><div><dt>Product cost{closed?' (reversed)':''}</dt><dd>{money(totals.productCost)}</dd></div><div><dt>Courier cost</dt><dd>{money(values.courier_cost)}</dd></div><div><dt>Additional shipping / packing cost</dt><dd>{money(values.shipping_cost)}</dd></div><div><dt>Return cost</dt><dd>{money(values.return_cost)}</dd></div><div><dt>Total costs applied before agent shares</dt><dd>{money(totals.totalCosts)}</dd></div><div><dt>Total sales agent + broker shares</dt><dd>{money(totals.totalCommission)}</dd></div>{totals.agentReturnDeduction>0&&<div><dt>Return costs charged to sales agent (receivable)</dt><dd>{money(totals.agentReturnDeduction)}</dd></div>}<div><dt>Total costs including both shares</dt><dd>{money(totals.totalCosts+totals.totalCommission)}</dd></div></dl>
 <div className="stats-grid" aria-live="polite" aria-atomic="true"><div className="stat"><span className="stat-top">{totals.estimated?'Estimated profit before agent shares':'Profit before agent shares'}</span><strong className={totals.profit<0?'money-negative':''}>{money(totals.profit)}</strong></div><div className="stat"><span className="stat-top">{totals.agentReturnDeduction>0?"Sales agent net / amount due":"Sales agent profit"} · {salesPct}%</span><strong>{money(totals.agentProfit)}</strong></div><div className="stat"><span className="stat-top">Broker profit{values.broker_id?' · '+brokerPct+'%':''}</span><strong>{money(totals.brokerProfit)}</strong></div><div className="stat"><span className="stat-top">{totals.estimated?'My estimated net profit':'My net profit'}</span><strong className={totals.netProfit<0?'money-negative':'money-positive'}>{money(totals.netProfit)}</strong></div></div>
 <p className="compact-note">Gross sales commission = {baseLabel} × {salesPct}%. Broker commission = {values.broker_id?baseLabel+' × '+brokerPct+'%':'0 (no broker selected)'}. Returned orders earn neither commission.<br/>Sales agent net = gross sales commission − returned-package charges.<br/>My net profit = sales revenue − product cost − courier − additional shipping / packing − return cost − gross sales commission − broker commission + returned-package charges recoverable from the sales agent.</p></>}
 <p className="compact-note">{totals.estimated?'These amounts estimate the split on delivery. Both commissions are earned only after delivery. ':values.status==='RETURNED'?'Sales and product cost are reversed. Neither agent earns commission. Courier, additional shipping/packing and return costs are charged to the sales agent, reducing their commission balance or creating dues. Business net includes this agent receivable; no cash repayment has been recorded. ':closed?'Cancelled orders earn neither commission. Recorded delivery costs remain business expenses. ':''}{retail?'Both percentages use retail product sales, excluding customer shipping charges. ':''}Save order and status to apply changes.</p></div>;
}
