import {NextResponse} from 'next/server';
import {query} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try{await query('SELECT 1');return NextResponse.json({app:'ok',database:'connected'},{headers:{'Cache-Control':'no-store'}})}
 catch{return NextResponse.json({app:'ok',database:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
