import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function Home(){
 const u=await currentUser();
 if(!u) redirect('/login');
 redirect(u.role==='DELIVERY'?'/deliveries':u.role==='WAREHOUSE'?'/inventory':u.role==='SALES'?'/agent':u.role==='FIELD_SALES'?'/field':'/dashboard');
}
