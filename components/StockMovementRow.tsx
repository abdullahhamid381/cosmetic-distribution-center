'use client';
import {useRouter} from 'next/navigation';
import type {ReactNode} from 'react';

export function StockMovementRow({href,children}:{href:string;children:ReactNode}) {
 const router=useRouter();
 return <tr className="stock-movement-row" onClick={event=>{
  if((event.target as HTMLElement).closest('a,button,input,select,textarea')||window.getSelection()?.toString())return;
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  router.push(href);
 }}>{children}</tr>;
}
