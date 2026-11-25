import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {records} from '@/lib/records';

export async function RecordActions({entity,id}:{entity:string;id:string|number}) {
 const user=await requireUser();
 if(!records[entity]?.roles.includes(user.role)) return null;
 return <div className="actions"><Link className="btn outline" href={`/manage/${entity}/${id}`}>Edit</Link><Link className="btn outline" href={`/manage/${entity}/${id}#delete`}>Delete</Link></div>;
}
