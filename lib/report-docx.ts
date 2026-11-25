import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,ShadingType,AlignmentType,HeadingLevel,PageOrientation,Header,Footer,PageNumber,ImageRun,BorderStyle} from 'docx';
import sharp from 'sharp';
import path from 'node:path';
import type {ReportDocument,ReportTable} from './report-document';

export async function reportDocx(report:ReportDocument){
 const legal=report.title==='Business report';
 const tableWidth=legal?10800:15398;
 const logo=await sharp(path.join(process.cwd(),'public/hh-medics-logo.png')).trim().png().toBuffer();
 const meta=await sharp(logo).metadata();
 const text=(value:string,bold=false,color='302A40',size=18)=>new TextRun({text:value,bold,color,size,font:'Calibri'});
 const paragraph=(value:string,options:ConstructorParameters<typeof Paragraph>[0]={})=>new Paragraph({children:[text(value)],spacing:{after:110},...(typeof options==='object'?options:{})});
 const table=(section:ReportTable)=>{
  const widths=section.widths.map(w=>Math.round(w/100*tableWidth));widths[widths.length-1]+=tableWidth-widths.reduce((a,b)=>a+b,0);
  const row=(values:string[],header=false,index=0)=>new TableRow({tableHeader:header,children:values.map((value,i)=>new TableCell({width:{size:widths[i],type:WidthType.DXA},shading:{type:ShadingType.CLEAR,fill:header?'5842BA':index%2===0?'F6F5F9':'FFFFFF'},margins:{top:95,bottom:95,left:110,right:110},children:value.split(/\r?\n/).map(v=>new Paragraph({children:[text(v,header,header?'FFFFFF':'4C435C',16)],spacing:{after:35}}))}))});
  return new Table({width:{size:tableWidth,type:WidthType.DXA},columnWidths:widths,borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideHorizontal:{style:BorderStyle.SINGLE,color:'EAE6EF',size:3},insideVertical:{style:BorderStyle.NONE}},rows:[row(section.headers,true),...(section.rows.length?section.rows:[section.headers.map((_,i)=>i===0?'No records in this selection.':'')]).map((values,index)=>row(values,false,index))]});
 };
 const children:(Paragraph|Table)[]=[
  new Paragraph({text:report.title,heading:HeadingLevel.TITLE,spacing:{after:140}}),
  paragraph(`${report.scope} | ${report.period}`),paragraph(`Generated ${report.generated} | Prepared by ${report.preparedBy}`),
  new Paragraph({text:'Financial summary',heading:HeadingLevel.HEADING_1,spacing:{before:200,after:140},keepNext:true}),
  table({title:'Financial summary',headers:['Metric','Value'],widths:[65,35],rows:report.metrics.map(m=>[m.label,m.value])}),
  ...report.notes.map(note=>paragraph(note,{spacing:{before:90,after:75},children:[text(note,false,'82778D',16)]})),
 ];
 for(const section of report.tables){
  children.push(new Paragraph({text:section.title,heading:HeadingLevel.HEADING_1,keepNext:true,spacing:{before:260,after:140}}));
  if(section.note)children.push(paragraph(section.note,{keepNext:true,children:[text(section.note,false,'82778D',16)]}));
  children.push(table(section));
 }
 const doc=new Document({creator:'HH MEDICS',title:report.title==='Business report'?'HH MEDICS Business Report':report.title==='Monthly closing'?'HH MEDICS Monthly Closing':'HH MEDICS '+report.title,description:`${report.scope} | ${report.period}`,styles:{default:{document:{run:{font:'Calibri',size:18,color:'302A40'},paragraph:{spacing:{after:100}}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',next:'Normal',run:{size:42,bold:true,color:'211B30'}},{id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',run:{size:26,bold:true,color:'5842BA'}}]},sections:[{
  properties:{page:{size:{width:legal?12240:11906,height:legal?20160:16838,orientation:legal?PageOrientation.PORTRAIT:PageOrientation.LANDSCAPE},margin:{top:1050,bottom:900,left:720,right:720,header:350,footer:350}}},
  headers:{default:new Header({children:[new Paragraph({children:[new ImageRun({type:'png',data:logo,transformation:{width:140,height:Math.round(140*(meta.height||1)/(meta.width||1))}})],spacing:{after:100}})]})},
  footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[text(`HH MEDICS | Confidential business information     Generated: ${report.generated}     Page `,false,'93879F',14),new TextRun({children:[PageNumber.CURRENT],size:14,color:'93879F'}),text(' of ',false,'93879F',14),new TextRun({children:[PageNumber.TOTAL_PAGES],size:14,color:'93879F'})]})]})},children,
 }]});
 return Packer.toBuffer(doc);
}
