import 'server-only';
import {requireRole} from './auth';
import {query} from './db';
import {redirect} from 'next/navigation';
export async function requireAgent(){
 const user=await requireRole('SALES');
 const profile=(await query('SELECT id,user_id,phone,address,territory,designation,commission_pct FROM sales_agents WHERE user_id=$1 AND active=true',[user.id]))[0];
 if(!profile)redirect('/agent-login?error=disabled');
 return {user,profile};
}
