'use client';
import {useRouter} from 'next/navigation';
export function ClosingScopeSelect({shop,shops}:{shop:string;shops:{id:string;name:string}[]}){
 const router=useRouter();
 return <select id="session-shop" name="shop" value={shop} onChange={e=>router.push(`/monthly-closing?${new URLSearchParams({shop:e.target.value})}`)}><option value="">All shops</option>{shops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>;
}
