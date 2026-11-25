export function pakistanToday(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function nextDate(date:string){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function closingPeriod(from:string,to:string,now=new Date()){
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v>='2000-01-01';
 if(!valid(from)||!valid(to))throw new Error('Choose valid From and To dates.');
 if(from>to)throw new Error('From date must be on or before To date.');
 if(to>pakistanToday(now))throw new Error('A closing cannot include future dates.');
 return {from,to,start:from,cutoff:nextDate(to),month:from.slice(0,7)};
}
export function validateSessionSequence(from:string,to:string,closed:{from_date:string;through_date:string}[]){
 if(closed.some(s=>s.from_date===from&&s.through_date===to))return false;
 if(closed.some(s=>s.from_date<=to&&s.through_date>=from))throw new Error('This range overlaps a closed session. Reopen that session before changing its dates.');
 const latest=[...closed].sort((a,b)=>b.through_date.localeCompare(a.through_date))[0];
 if(latest&&nextDate(latest.through_date)!==from)throw new Error(`The next session must start on ${nextDate(latest.through_date)} to avoid a gap. Change the start date or reopen the earlier closing.`);
 return true;
}
