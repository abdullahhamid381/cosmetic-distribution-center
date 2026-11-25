'use client';
import {useFormStatus} from 'react-dom';
export function DeleteRecordButton({message}:{message:string}) {
 const {pending}=useFormStatus();
 return <button type="submit" className="btn outline" disabled={pending} onClick={event=>{if(!window.confirm(message+' Continue?'))event.preventDefault();}}>{pending?'Deleting…':'Delete'}</button>;
}
