'use client';
import {useActionState,useState} from 'react';
import {receiveStock} from '@/app/actions';

type Option={id:string;name:string};
export function ReceiveStockForm({products,warehouses}:{products:Option[];warehouses:Option[]}){
 const [values,setValues]=useState({product_id:products[0]?.id||'',warehouse_id:warehouses[0]?.id||'',batch_number:'',quantity:'',unit_cost:'',manufacture_date:'',expiry_date:'',note:''});
 const [state,action,pending]=useActionState(async(_previous:{error:string},form:FormData)=>await receiveStock(form)||{error:''},{error:''});
 const field=(name:keyof typeof values)=>({name,value:values[name],onChange:(event:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setValues(previous=>({...previous,[name]:event.target.value}))});
 return <form action={action} className="form-grid">
  {state.error&&<div className="alert error field span-2" role="alert" aria-live="polite">{state.error}</div>}
  <div className="field"><label htmlFor="receive-product">Product *</label><select id="receive-product" {...field('product_id')} required>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
  <div className="field"><label htmlFor="receive-warehouse">Warehouse *</label><select id="receive-warehouse" {...field('warehouse_id')} required>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
  <div className="field"><label htmlFor="receive-batch">Batch number *</label><input id="receive-batch" {...field('batch_number')} required placeholder="BATCH-2026-001"/><small>Reuse a reference only when its unit cost and batch dates match.</small></div>
  <div className="field"><label htmlFor="receive-quantity">Units received *</label><input id="receive-quantity" {...field('quantity')} type="number" min="1" step="1" required/></div>
  <div className="field"><label htmlFor="receive-cost">Unit cost (Rs.) *</label><input id="receive-cost" {...field('unit_cost')} type="number" min="0" step="0.01" required/><small>For a different cost, use a new batch reference.</small></div>
  <div className="field"><label htmlFor="receive-manufacture">Manufacture date</label><input id="receive-manufacture" {...field('manufacture_date')} type="date"/></div>
  <div className="field"><label htmlFor="receive-expiry">Expiry date</label><input id="receive-expiry" {...field('expiry_date')} type="date"/></div>
  <div className="field"><label htmlFor="receive-note">Receipt note</label><input id="receive-note" {...field('note')} placeholder="Reference / manufacturer PO"/></div>
  <div className="field span-2"><button type="submit" className="btn primary" disabled={pending||!products.length||!warehouses.length}>{pending?'Receiving stock...':'+ Receive Stock'}</button></div>
 </form>;
}
