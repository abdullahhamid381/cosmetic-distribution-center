'use client';
import {useId,useState} from 'react';
import {tradeFromRetail} from '@/lib/product-pricing';
export function ProductPricingFields({retailPrice='',tradePrice=''}:{retailPrice?:string|number;tradePrice?:string|number}) {
 const id=useId();
 const [retail,setRetail]=useState(String(retailPrice)),[trade,setTrade]=useState(String(tradePrice));
 const [percentage,setPercentage]=useState(Number(retailPrice)>0?((1-Number(tradePrice)/Number(retailPrice))*100).toFixed(2):'');
 const [generated,setGenerated]=useState(false);
 function calculate(r:string,p:string) {
  if(r!==''&&p!==''&&Number.isFinite(Number(r))&&Number(r)>=0&&Number.isFinite(Number(p))&&Number(p)>=0&&Number(p)<=100)setTrade(tradeFromRetail(Number(r),Number(p)).toFixed(2));
  else setTrade('');
 }
 return <><div className="field"><label htmlFor={id+'-retail'}>Retail price (Rs.) *</label><input id={id+'-retail'} name="retail_price" type="number" min="0" step="0.01" required value={retail} onChange={e=>{const value=e.target.value;setRetail(value);if(percentage!==''){setGenerated(true);calculate(value,percentage);}}}/></div>
 <div className="field"><label htmlFor={id+'-percentage'}>Trade discount from retail (%)</label><input id={id+'-percentage'} type="number" min="0" max="100" step="0.01" value={percentage} placeholder="e.g. 40" onChange={e=>{setPercentage(e.target.value);setGenerated(e.target.value!=='');if(e.target.value!=='')calculate(retail,e.target.value);}}/><small>Trade price = retail price × (1 − discount ÷ 100).</small></div>
 <input type="hidden" name="trade_discount_pct" value={generated?percentage:''}/>
 <div className="field"><label htmlFor={id+'-trade'}>Trade price (Rs.) *</label><input id={id+'-trade'} name="trade_price" type="number" min="0" max={retail||undefined} step="0.01" required value={trade} onChange={e=>{const value=e.target.value;setTrade(value);setGenerated(false);setPercentage(Number(retail)>0&&value!==''?((1-Number(value)/Number(retail))*100).toFixed(2):'');}}/><small>{generated?'Calculated automatically from retail price and percentage.':'Enter a percentage to calculate, or enter the trade price directly.'}</small></div></>;
}
