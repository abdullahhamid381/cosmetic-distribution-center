'use client';
import {useActionState} from 'react';
import {closeSession,reopenSession} from '@/app/closing-session-actions';
export function ClosingSessionButton({shop,from,to,session}:{shop:string;from:string;to:string;session?:string}){
 const [state,action,pending]=useActionState(session?reopenSession:closeSession,{error:''});
 return <form action={action} className="closing-save-form"><input type="hidden" name="shop" value={shop}/><input type="hidden" name="from" value={from}/><input type="hidden" name="to" value={to}/>{session&&<><input type="hidden" name="session" value={session}/><div className="field"><label htmlFor="session-reason">Reason for reopening (optional)</label><input id="session-reason" name="reason" maxLength={1000}/></div></>}<button className={`btn ${session?'outline':'primary'}`} disabled={pending}>{pending?'Saving...':session?'Reopen this session':'Close summary & start next session'}</button>{state.error&&<p className="alert error" role="alert">{state.error}</p>}</form>;
}
