import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {auditFilters,auditReport,auditDocument} from '@/lib/audit-report';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const user=await requireRole('ADMIN');
 const format=request.nextUrl.searchParams.get('format');
 if(format!=='pdf'&&format!=='docx'&&format!=='xlsx')return NextResponse.json({error:'Choose PDF, Word or Excel.'},{status:400});
 const filters=auditFilters(Object.fromEntries(['from','to','actor','action','entity','q'].map(key=>[key,request.nextUrl.searchParams.get(key)||''])));
 if(filters.error)return NextResponse.json({error:filters.error},{status:400});
 const events=await auditReport(filters),report=auditDocument(events,filters,user.name);
 const bytes=format==='pdf'?await (await import('@/lib/report-pdf')).reportPdf(report):format==='docx'?await (await import('@/lib/report-docx')).reportDocx(report):await (await import('@/lib/audit-excel')).auditExcel(report,events);
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':format==='pdf'?'application/pdf':format==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="hh-medics-audit-report-${date}.${format}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
