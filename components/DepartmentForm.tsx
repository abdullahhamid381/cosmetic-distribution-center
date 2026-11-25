'use client';
import {useActionState,useState} from 'react';
export type DepartmentFormState={error?:string;success?:string};
export function DepartmentForm({action,children,className='form-grid section-gap',submitLabel='Save',id}:{action:(state:DepartmentFormState,form:FormData)=>Promise<DepartmentFormState>;children:React.ReactNode;className?:string;submitLabel?:string;id?:string}){
 const [state,formAction,pending]=useActionState(action,{});
 const [validationError,setValidationError]=useState('');
 return <form id={id} action={formAction} className={className} onSubmit={()=>setValidationError('')} onInputCapture={()=>setValidationError('')} onInvalidCapture={event=>{
  const field=event.currentTarget.querySelector<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input:invalid,select:invalid,textarea:invalid');
  if(field){const label=field.closest('.field')?.querySelector('label')?.textContent||field.name||'Required field';setValidationError(`${label}: ${field.validationMessage}`);}
 }}><fieldset disabled={pending} style={{display:'contents'}}>{children}<div className="field span-2"><div aria-live="polite">{(validationError||state.error)&&<p role="alert" className="form-feedback">{validationError||state.error}</p>}{!validationError&&!state.error&&state.success&&<p role="status" className="success-note">{state.success}</p>}</div><button type="submit" className="btn primary" disabled={pending}>{pending?'Saving...':submitLabel}</button></div></fieldset></form>;
}
