import {EditDistributionForm} from '@/components/EditDistributionForm';
import {PaymentReceiptInput} from '@/components/PaymentReceiptInput';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {roleLabel} from '@/lib/utils';
import {records} from '@/lib/records';
import {saveRecord,deleteRecord} from '@/app/record-actions';
import {DeleteRecordButton} from '@/components/DeleteRecordButton';

export default async function ManageRecord({params,searchParams}:{params:Promise<{entity:string;id:string}>;searchParams:Promise<{error?:string}>}) {
 const {entity,id}=await params, config=Object.hasOwn(records,entity)?records[entity]:null;
 if(!config || !/^\d+$/.test(id))notFound();
 await requireRole(...config.roles);
 const columns=config.fields.filter(f=>f.type!=='password').map(f=>f.type==='date'?`to_char(${f.name}, 'YYYY-MM-DD') AS ${f.name}`:f.name);
 const row=(await query(`SELECT id,${columns.join(',')} FROM ${config.table} WHERE id=$1`,[id]))[0];
 if(!row)notFound();
 const {error}=await searchParams;
 const receipt=entity==='payments'?(await query('SELECT file_name FROM payment_receipts WHERE payment_id=$1',[id]))[0]:null;
 return <><div className="page-title-row"><div className="page-title"><h1>Edit {config.title}</h1><p>Record #{id}</p></div><Link className="btn" href={config.path}>Back</Link></div>
 {error&&<div className="notice" role="alert">{error}</div>}
 {entity==='invoices'?<EditDistributionForm id={id}/>:<div className="card"><form action={saveRecord} className="form-grid">
 <input type="hidden" name="entity" value={entity}/><input type="hidden" name="id" value={id}/>
 {config.fields.map(f=><div className="field" key={f.name}><label htmlFor={f.name}>{f.label}</label>{f.options?<select id={f.name} name={f.name} defaultValue={String(row[f.name]??'')} required={f.required}>{f.options.map(option=><option key={option} value={option}>{entity==='staff'&&f.name==='role'?roleLabel(option):option}</option>)}</select>:f.type==='checkbox'?<input id={f.name} name={f.name} type="checkbox" defaultChecked={Boolean(row[f.name])}/>:<input id={f.name} name={f.name} type={f.type||'text'} defaultValue={f.type==='password'?'':String(row[f.name]??'')} required={f.required} min={f.min} max={f.max} step={f.step} autoComplete={f.type==='password'?'new-password':undefined}/>}</div>)}
 <>{entity==='payments'&&<><PaymentReceiptInput/>{receipt&&<div className="field span-2"><a className="btn outline" href={`/api/payments/${id}/receipt`} target="_blank" rel="noopener noreferrer">View current receipt: {receipt.file_name}</a></div>}</>}</><div className="field span-2"><button className="btn primary">Save changes</button></div></form></div>}
 <div id="delete" className="card section-gap"><h2>Delete {config.title}</h2><p className="card-sub">{config.deletion}</p><form action={deleteRecord} className="section-gap"><input type="hidden" name="entity" value={entity}/><input type="hidden" name="id" value={id}/><DeleteRecordButton message={config.deletion}/></form></div></>;
}
