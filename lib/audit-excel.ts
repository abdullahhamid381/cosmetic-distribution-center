import ExcelJS from 'exceljs';
import type {AuditEvent} from './audit-report';
import {detailRows,changedRows} from './audit-report';
import type {ReportDocument} from './report-document';

export async function auditExcel(report:ReportDocument,events:AuditEvent[]){
 const book=new ExcelJS.Workbook();book.creator='HH MEDICS';book.created=new Date();
 const sheet=(name:string,headers:string[],rows:(string|number)[][],widths:number[])=>{
  const s=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
  s.columns=widths.map(width=>({width}));s.addRow(headers);rows.forEach(row=>s.addRow(row));
  s.eachRow((row,index)=>{row.eachCell(cell=>{cell.font={name:'Arial',size:10,color:{argb:index===1?'FFFFFFFF':'FF211B30'},bold:index===1};cell.alignment={vertical:'top',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index===1?'FF5842BA':index%2===0?'FFF6F5F9':'FFFFFFFF'}};});row.height=index===1?28:Math.min(400,Math.max(30,...(Array.isArray(row.values)?row.values:[]).map(v=>typeof v==='string'?Math.ceil(v.length/60)*15:30)));});
  s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,s.rowCount),column:headers.length}};
  s.headerFooter.oddFooter=`&LHH MEDICS | Generated: ${report.generated.replace(/&/g,'&&')}&RPage &P of &N`;
  return s;
 };
 sheet('Report summary',['Item','Value'],[['Report',report.title],['Scope',report.scope],['Period',report.period],['Generated (PKT)',report.generated],['Prepared by',report.preparedBy],...report.metrics.map(m=>[m.label,m.value]),...report.notes.map((n,i)=>[`Note ${i+1}`,n])],[30,110]);
 sheet('Event register',['Event ID','Timestamp (PKT)','Staff member','Email','Role','Action','Record type','Record ID','Source'],events.map(e=>[e.id,e.timestamp,e.actor,e.email,e.role,e.action,e.entity,e.recordId,e.source]),[16,29,28,32,18,36,22,16,24]);
 sheet('Recorded details',['Event ID','Timestamp (PKT)','Field / path','Recorded value'],events.flatMap(e=>(e.details===null||e.details===undefined?[['Details','No additional details saved.']]:detailRows(e.details)).map(r=>[e.id,e.timestamp,...r])),[16,29,45,110]);
 sheet('Before and after',['Event ID','Timestamp (PKT)','Staff member','Field','Before','After'],events.flatMap(e=>changedRows(e.details).map(r=>[e.id,e.timestamp,e.actor,...r])),[16,29,28,30,60,60]);
 for(const table of report.tables.slice(0,3))sheet(table.title.replace('Activity by ','By '),table.headers,table.rows,[45,20]);
 return book.xlsx.writeBuffer();
}
