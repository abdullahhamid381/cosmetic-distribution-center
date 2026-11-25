'use client';

import {useState} from 'react';
import {editLocalSale,recordLocalSale} from '@/app/local-sales-actions';
import {dispatchPricing} from '@/lib/product-pricing';
import {paymentMethods} from '@/lib/sales-team';
import {DepartmentForm} from './DepartmentForm';

type Batch={id:string;label:string;price:number;stock:number};
const money=new Intl.NumberFormat('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2});
const discountFields=[['first','first_discount_pct','1st discount (%)'],['second','second_discount_pct','2nd discount (%)']] as const;

function saleRow(id:number) {
 return {id,batchId:'',quantity:'1',first:'0',second:'0'};
}

function previewPrice(retail:number,first:string,second:string) {
 const rates=[Number(first),Number(second)];
 if(rates.some(rate=>!Number.isFinite(rate)||rate<0||rate>100))return 0;
 return dispatchPricing(retail,Math.round(rates[0]*100)/100,Math.round(rates[1]*100)/100,0).price;
}

type SaleEdit={id:string;version:string;rows:ReturnType<typeof saleRow>[];customer:{customer_name:string;phone:string;alternate_phone:string;email:string;address:string;city:string;note:string};collected:number;shipping:number};

export function LocalSaleForm({batches,edit}:{batches:Batch[];edit?:SaleEdit}) {
 const [rows,setRows]=useState(edit?.rows.length?edit.rows:[saleRow(1)]);
 const [nextId,setNextId]=useState(rows.length+1);
 const [paymentMethod,setPaymentMethod]=useState('CASH');
 const [customer,setCustomer]=useState(edit?.customer??{customer_name:'',phone:'',alternate_phone:'',email:'',address:'',city:'',note:''});
 const changeCustomer=(key:keyof typeof customer,value:string)=>setCustomer(current=>({...current,[key]:value}));
 const total=rows.reduce((sum,row)=>sum+previewPrice(batches.find(batch=>batch.id===row.batchId)?.price??0,row.first,row.second)*Number(row.quantity),0);
 return <DepartmentForm action={edit?editLocalSale:recordLocalSale} submitLabel={edit?'Save invoice changes':'Record local sale'}>
  {edit&&<><input type="hidden" name="invoice_id" value={edit.id}/><input type="hidden" name="invoice_version" value={edit.version}/></>}
  <div className="field"><label htmlFor="local-name">Customer name</label><input id="local-name" name="customer_name" value={customer.customer_name} onChange={e=>changeCustomer('customer_name',e.target.value)} required/></div>
  <div className="field"><label htmlFor="local-phone">Phone (optional)</label><input id="local-phone" name="phone" type="tel" value={customer.phone} onChange={e=>changeCustomer('phone',e.target.value)}/></div>
  {edit&&([
   ['alternate_phone','Alternate phone','tel'],['email','Email','email'],['city','City','text'],['address','Address','text'],
  ] as const).map(([key,label,type])=><div className="field" key={key}><label htmlFor={`local-${key}`}>{label}</label><input id={`local-${key}`} name={key} type={type} value={customer[key]} onChange={e=>changeCustomer(key,e.target.value)}/></div>)}
  <div className="field span-2"><h2>Products</h2><small>The second discount applies to the price after the first. Enter 0 to skip a discount.</small></div>
  {rows.map((row,index)=>{
   const batch=batches.find(batch=>batch.id===row.batchId);
   return <div key={row.id} className="line-item span-2" style={{gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))'}}>
    <div className="field" style={{gridColumn:'1 / -1'}}><label htmlFor={`local-batch-${row.id}`}>Batch {index+1}</label><select id={`local-batch-${row.id}`} name="batch_id" required value={row.batchId} onChange={e=>setRows(current=>current.map(item=>item.id===row.id?{...item,batchId:e.target.value}:item))}><option value="">Choose stock</option>{batches.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select></div>
    <div className="field"><label htmlFor={`local-qty-${row.id}`}>Quantity</label><input id={`local-qty-${row.id}`} name="quantity" type="number" min="1" max={batch?.stock} step="1" required value={row.quantity} onChange={e=>setRows(current=>current.map(item=>item.id===row.id?{...item,quantity:e.target.value}:item))}/></div>
    {discountFields.map(([key,name,label])=><div className="field" key={key}><label htmlFor={`${name}-${row.id}`}>{label}</label><input id={`${name}-${row.id}`} name={name} type="number" min="0" max="100" step="0.01" required value={row[key]} onChange={e=>setRows(current=>current.map(item=>item.id===row.id?{...item,[key]:e.target.value}:item))}/></div>)}
    {batch&&<div className="field"><span>Unit price</span><strong>Rs. {money.format(previewPrice(batch.price,row.first,row.second))}</strong></div>}
    {rows.length>1&&<button type="button" className="btn" aria-label={`Remove product row ${index+1}`} onClick={()=>setRows(current=>current.filter(item=>item.id!==row.id))}>Remove</button>}
   </div>;
  })}
  <div className="field span-2"><div className="actions"><button className="btn" type="button" disabled={rows.length>=50} onClick={()=>{setRows(current=>[...current,saleRow(nextId)]);setNextId(value=>value+1);}}>Add product</button><strong>Invoice total Rs. {money.format(total+(edit?.shipping??0))}</strong></div></div>
  {edit?<p className="notice span-2">Payments already recorded: Rs. {money.format(edit.collected)}. Record additional payments from the invoice details.</p>:<>
   <div className="field"><label htmlFor="local-payment">Payment</label><select id="local-payment" name="payment_method" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="DUE">Pending payment (collect later)</option>{paymentMethods.filter(method=>method!=='COD').map(method=><option key={method}>{method}</option>)}</select></div>
   {paymentMethod==='DUE'?<p className="card-sub">The sale total will be due. Record each payment when you receive it.</p>:<div className="field"><label htmlFor="local-reference">Payment reference (optional)</label><input id="local-reference" name="payment_reference"/></div>}
  </>}
  <div className="field span-2"><label htmlFor="local-note">Notes (optional)</label><textarea id="local-note" name="note" value={customer.note} onChange={e=>changeCustomer('note',e.target.value)}/></div>
 </DepartmentForm>;
}
