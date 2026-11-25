import {NextRequest,NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {sessionById,sessionPreview,validScope} from '@/lib/closing-sessions';
import {closingPeriod} from '@/lib/closing-period';
import {sessionReportDocument} from '@/lib/session-report-document';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS'),p=request.nextUrl.searchParams,shop=p.get('shop')||'',format=p.get('format');
 if(format!=='pdf'&&format!=='docx')return NextResponse.json({error:'Choose PDF or Word format.'},{status:400});
 let selected,from,to;
 try{validScope(shop);selected=p.get('session')?await sessionById(p.get('session')!):null;if(p.get('session')&&(!selected||selected.scope_key!==(shop||'0')))throw new Error('Closing session not found for this scope.');from=selected?.from_date||p.get('from')||'';to=selected?.through_date||p.get('to')||'';closingPeriod(from,to);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Choose valid dates.'},{status:400});}
 let scope='All shops';if(shop){const [s]=await query('SELECT shop_name FROM shops WHERE id=$1',[shop]);if(!s)return NextResponse.json({error:'Shop not found.'},{status:404});scope=String(s.shop_name);}
 const saved=Boolean(selected)&&p.get('view')!=='live',snapshot=saved?selected!.snapshot:await sessionPreview(from,to,shop);
 const source=saved?`Saved session #${selected!.id}, closed by ${selected!.staff} at ${selected!.closed_at} PKT. Status: ${selected!.status}.`:'Live recalculation from records for the selected dates (Pakistan time).';
 const report=sessionReportDocument(snapshot,from,to,user.name,scope,source);
 const bytes=format==='pdf'?await (await import('@/lib/report-pdf')).reportPdf(report):await (await import('@/lib/report-docx')).reportDocx(report);
 return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':`attachment; filename="hh-medics-closing-${from}-to-${to}.${format}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
