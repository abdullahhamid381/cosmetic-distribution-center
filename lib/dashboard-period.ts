export function dashboardPeriod(input:string|undefined,now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(name:string)=>parts.find(p=>p.type===name)!.value;
 const today=`${part('year')}-${part('month')}-${part('day')}`;
 const labels:Record<string,string>={today:'Today',week:'This week',month:'This month',year:'This year',all:'All time'};
 const period=input&&Object.hasOwn(labels,input)?input:'month';
 const monday=new Date(today+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
 const from=period==='all'?null:period==='today'?today:period==='week'?monday.toISOString().slice(0,10):period==='year'?today.slice(0,4)+'-01-01':today.slice(0,7)+'-01';
 return {period,label:labels[period],from,to:today};
}
