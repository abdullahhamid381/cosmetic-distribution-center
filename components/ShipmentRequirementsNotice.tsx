'use client';
import {useEffect,useRef,useState} from 'react';
export function ShipmentRequirementsNotice({status,courier,tracking}:{status:string;courier:string;tracking:string}){
 const anchor=useRef<HTMLDivElement>(null);
 const message=(s:string,c:string,t:string)=>!['DISPATCHED','DELIVERED'].includes(s)?'':!c.trim()&&!t.trim()?'Enter the courier company and tracking number before saving this shipment.':!c.trim()?'Enter the courier company before saving this shipment.':!t.trim()?'Enter the tracking / consignment number before saving this shipment.':'';
 const [notice,setNotice]=useState(()=>message(status,courier,tracking));
 useEffect(()=>{
  const form=anchor.current?.closest('form');if(!form)return;
  const update=()=>{
   const value=(name:string,fallback:string)=>(form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement|null)?.value??fallback;
   setNotice(message(value('status',status),value('courier_name',courier),value('tracking_number',tracking)));
  };
  update();form.addEventListener('input',update);form.addEventListener('change',update);
  return()=>{form.removeEventListener('input',update);form.removeEventListener('change',update);};
 },[status,courier,tracking]);
 return <div ref={anchor} className="field span-2" aria-live="polite" hidden={!notice}>{notice&&<p className="notice" role="status">{notice}</p>}</div>;
}
