'use client';
import {useActionState} from 'react';
import {closeMonth,reopenMonth} from '@/app/monthly-closing-actions';
export function CloseMonthButton({month,shop,disabled,closed=false}:{month:string;shop:string;disabled:boolean;closed?:boolean}){
 const [state,action,pending]=useActionState(closed?reopenMonth:closeMonth,{error:'',message:''});
 return <form action={action} className="closing-save-form"><input type="hidden" name="month" value={month}/><input type="hidden" name="shop" value={shop}/>{closed&&<div className="field"><label htmlFor="reopen-reason">Reason for reopening (optional)</label><input id="reopen-reason" name="reason" maxLength={1000} placeholder="Payment received or correction needed"/></div>}<button type="submit" className={`btn ${closed?'outline':'primary'}`} disabled={disabled||pending}>{pending?(closed?'Reopening...':'Saving closing...'):closed?'Reopen closing':'Close now & save summary'}</button>{state.error&&<p className="alert error" role="alert">{state.error}</p>}{state.message&&<p className="notice" role="status">{state.message}</p>}</form>;
}
