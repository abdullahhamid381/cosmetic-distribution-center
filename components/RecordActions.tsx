import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {records} from '@/lib/records';
import {deleteRecord} from '@/app/record-actions';
import {DeleteRecordButton} from './DeleteRecordButton';

export async function RecordActions({entity,id}:{entity:string;id:string|number}) {
 const user=await requireUser();
 if(!records[entity]?.roles.includes(user.role)) return null;
 return <div className="actions">
  <Link className="btn outline" href={`/manage/${entity}/${id}`}>Edit</Link>
  {entity==='staff' ? Number(id)!==user.id && <form action={deleteRecord}>
   <input type="hidden" name="entity" value="staff"/>
   <input type="hidden" name="id" value={id}/>
   <DeleteRecordButton/>
  </form> : <Link className="btn outline" href={`/manage/${entity}/${id}#delete`}>Delete</Link>}
 </div>;
}
