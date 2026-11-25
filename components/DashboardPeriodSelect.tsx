'use client';
import {useRouter} from 'next/navigation';
import {CalendarDays} from 'lucide-react';
export function DashboardPeriodSelect({period}:{period:string}){
 const router=useRouter();
 return <label className="period-select"><CalendarDays size={18}/><select aria-label="Dashboard period" value={period} onChange={e=>router.push(`/dashboard?period=${e.target.value}`)}>{[['today','Today'],['week','This Week'],['month','This Month'],['year','This Year'],['all','All Time']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>;
}
