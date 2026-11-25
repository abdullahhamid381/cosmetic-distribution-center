import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {businessReport,reportFilters} from '@/lib/report-data';
import {reportDocument} from '@/lib/report-document';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const format=request.nextUrl.searchParams.get('format');
 if(format!=='pdf'&&format!=='docx')return NextResponse.json({error:'Choose PDF or Word format.'},{status:400});
 const filters=reportFilters(Object.fromEntries(['shop','from','to','product'].map(key=>[key,request.nextUrl.searchParams.get(key)||''])));
 if(filters.error)return NextResponse.json({error:filters.error},{status:400});
 let store='All stores';
 if(filters.shop){const [row]=await query('SELECT shop_name FROM shops WHERE id=$1',[filters.shop]);if(!row)return NextResponse.json({error:'The selected store was not found.'},{status:404});store=String(row.shop_name);}
 if(filters.product){const [row]=await query('SELECT id FROM products WHERE id=$1',[filters.product]);if(!row)return NextResponse.json({error:'The selected product was not found.'},{status:404});}
 const data=await businessReport(filters);
 const model=reportDocument(data,filters,store,user.name);
 const bytes=format==='pdf'?await (await import('@/lib/report-pdf')).reportPdf(model):await (await import('@/lib/report-docx')).reportDocx(model);
 const fileDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return new NextResponse(new Uint8Array(bytes),{headers:{
  'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'Content-Disposition':`attachment; filename="hh-medics-business-report-${fileDate}.${format}"`,
  'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
 }});
}
