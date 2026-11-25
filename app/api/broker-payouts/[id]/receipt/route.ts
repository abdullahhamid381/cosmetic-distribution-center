import {currentUser} from '@/lib/auth';
import {query} from '@/lib/db';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();
 if(!user)return new Response('Sign in to view this receipt',{status:401});
 if(!['ADMIN','MANAGER','ACCOUNTS'].includes(user.role))return new Response('Forbidden',{status:403});
 const {id}=await params;
 if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1)return new Response('Not found',{status:404});
 const [receipt]=await query('SELECT file_name,content_type,file_data FROM broker_payout_receipts WHERE payout_id=$1',[id]);
 if(!receipt)return new Response('No broker payout receipt attached',{status:404});
 const disposition=new URL(request.url).searchParams.get('download')==='1'?'attachment':'inline';
 return new Response(new Uint8Array(receipt.file_data),{headers:{
  'Content-Type':receipt.content_type,
  'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(receipt.file_name)}`,
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"sandbox; default-src 'none'",
 }});
}
