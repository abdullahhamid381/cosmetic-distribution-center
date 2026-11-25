'use client';
import {useState} from 'react';
import {updateProductPrices} from '@/app/actions';
type Product={id:number;sku:string;name:string;manufacturer_price:number;box_cost:number;retail_price:number;min_stock:number};
export function ProductPriceEditor({products}:{products:Product[]}) {
 const [selected,setSelected]=useState(Number(products[0]?.id||0));
 const pick=(id:number)=>{setSelected(id);};
 const product=products.find(p=>p.id===selected);
 return <form action={updateProductPrices} className="form-grid section-gap"><div className="field span-2"><label>Product</label><select name="id" value={selected} onChange={e=>pick(Number(e.target.value))} required>{products.map(p=><option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}</select></div>
 <div key={selected} className="form-grid field span-2">{([['Manufacturing price (Rs.)','manufacturer_price'],['Box cost per unit (Rs.)','box_cost'],['Retail price (Rs.)','retail_price'],['Minimum stock','min_stock']] as const).map(([label,key])=><div className="field" key={key}><label>{label}</label><input name={key} type="number" step={key==='min_stock'?'1':'0.01'} min="0" defaultValue={product?.[key]??0} required/></div>)}</div><div className="field span-2"><p className="card-sub">Trade price is calculated from the percentage entered when dispatching each invoice.</p><button className="btn dark">Update prices</button></div></form>;
}
