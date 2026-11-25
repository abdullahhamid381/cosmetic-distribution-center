export function pakistanClock(now=new Date()){
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(now);
}
export function brokerPaymentTime(day:string,value:string,now=new Date()){
 const time=value||pakistanClock(now);
 if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time))throw new Error('Enter a valid payment time.');
 const paidAt=new Date(day+'T'+(time.length===5?time+':00':time)+'+05:00');
 if(!Number.isFinite(paidAt.getTime()))throw new Error('Enter a valid payment date and time.');
 if(paidAt.getTime()>now.getTime()+60000)throw new Error('Payment date and time cannot be in the future.');
 return time;
}
