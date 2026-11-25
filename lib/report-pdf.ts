import {PDFDocument,PageSizes,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type {ReportDocument,ReportTable} from './report-document';

export async function reportPdf(report:ReportDocument,{customerCopy=false}:{customerCopy?:boolean}={}){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 pdf.setTitle(report.title==='Business report'?'HH MEDICS Business Report':report.title==='Monthly closing'?'HH MEDICS Monthly Closing':'HH MEDICS '+report.title);pdf.setAuthor('HH MEDICS');pdf.setSubject(`${report.scope} | ${report.period}`);
 const [regularBytes,boldBytes,logoBytes]=await Promise.all([
  readFile(path.join(process.cwd(),'public/report-fonts/noto-sans-regular.woff')),
  readFile(path.join(process.cwd(),'public/report-fonts/noto-sans-bold.woff')),
  sharp(path.join(process.cwd(),'public/hh-medics-logo.png')).trim().png().toBuffer(),
 ]);
 const regular=await pdf.embedFont(regularBytes,{subset:true}),bold=await pdf.embedFont(boldBytes,{subset:true}),logo=await pdf.embedPng(logoBytes);
 const [width,height]=report.title==='Business report'?PageSizes.Legal:[PageSizes.A4[1],PageSizes.A4[0]];
 const margin=36,bodyWidth=width-margin*2;
 const ink=rgb(.14,.12,.23),muted=rgb(.48,.48,.56),purple=rgb(.34,.26,.72),light=rgb(.96,.96,.98),line=rgb(.9,.9,.94);
 let page!:PDFPage,y=0;
 const clean=(value:string)=>String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
 const wrap=(value:string,font:PDFFont,size:number,maxWidth:number)=>{
  const result:string[]=[];
  for(const paragraph of clean(value).split(/\r?\n/)){
   let current='';
   for(const word of paragraph.split(/\s+/)){
    const candidate=current?current+' '+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=maxWidth){current=candidate;continue;}
    if(current){result.push(current);current='';}
    for(const char of word){if(current&&font.widthOfTextAtSize(current+char,size)>maxWidth){result.push(current);current='';}current+=char;}
   }
   result.push(current);
  }
  return result;
 };
 const draw=(value:string,x:number,at:number,size=9,font=regular,color=ink)=>page.drawText(clean(value),{x,y:at,size,font,color});
 function newPage(){
  page=pdf.addPage([width,height]);y=height-105;
  const imageWidth=135,imageHeight=logo.height/logo.width*imageWidth;
  page.drawImage(logo,{x:margin,y:height-32-imageHeight,width:imageWidth,height:imageHeight});
  let titleSize=13;while(bold.widthOfTextAtSize(report.title.toUpperCase(),titleSize)>200&&titleSize>8)titleSize--;
  draw(report.title.toUpperCase(),width-margin-200,height-43,titleSize,bold,purple);
  draw(customerCopy?'Customer copy | PKR':report.title==='Detailed audit report'?'Private audit report | PKT':'Private management report | PKR',width-margin-162,height-59,8,regular,muted);
  page.drawLine({start:{x:margin,y:height-78},end:{x:width-margin,y:height-78},thickness:1,color:line});
 }
 function ensure(space:number){if(y-space<55)newPage();}
 function paragraph(value:string,size=9,color=muted){for(const content of wrap(value,regular,size,bodyWidth)){ensure(size+5);draw(content,margin,y,size,regular,color);y-=size+5;}y-=5;}
 newPage();
 draw(report.title,margin,y,25,bold);y-=28;
 paragraph(`${report.scope} | ${report.period}`,11,ink);
 paragraph(customerCopy?`Generated ${report.generated}`:`Generated ${report.generated} | Prepared by ${report.preparedBy}`,8);
 const metricWidth=(bodyWidth-24)/3;
 for(let index=0;index<report.metrics.length;index++){
  if(index%3===0){ensure(70);if(index)y-=70;}
  const metric=report.metrics[index],x=margin+(index%3)*(metricWidth+12);
  page.drawRectangle({x,y:y-54,width:metricWidth,height:62,color:light});
  wrap(metric.label,regular,8,metricWidth-22).forEach((label,lineIndex)=>draw(label,x+11,y-8-lineIndex*10,8,regular,muted));
  let size=16;while(bold.widthOfTextAtSize(metric.value,size)>metricWidth-22&&size>8)size--;
  draw(metric.value,x+11,y-34,size,bold,purple);
 }
 y-=78;
 for(const note of report.notes)paragraph(note,8);
 y-=5;
 function table(section:ReportTable){
  const widths=section.widths.map(w=>w/100*bodyWidth),fontSize=8,lineHeight=11;
  const headerLines=section.headers.map((h,i)=>wrap(h,bold,fontSize,widths[i]-14));
  const headerHeight=Math.max(...headerLines.map(h=>h.length))*lineHeight+15;
  const drawHeader=()=>{page.drawRectangle({x:margin,y:y-headerHeight,width:bodyWidth,height:headerHeight,color:purple});let x=margin;headerLines.forEach((lines,i)=>{lines.forEach((v,n)=>draw(v,x+7,y-12-n*lineHeight,fontSize,bold,rgb(1,1,1)));x+=widths[i];});y-=headerHeight;};
  ensure(75+headerHeight);draw(section.title,margin,y,14,bold);y-=22;
  if(section.note)paragraph(section.note,8);
  ensure(headerHeight+36);drawHeader();
  const rows=section.rows.length?section.rows:[section.headers.map((_,i)=>i===0?'No records in this selection.':'')];
  rows.forEach((row,index)=>{
   const lines=row.map((cell,i)=>wrap(cell,regular,fontSize,widths[i]-14));
   let offset=0;const count=Math.max(...lines.map(l=>l.length));
   while(offset<count){
    const remaining=count-offset,needed=remaining*lineHeight+15;
    if(y-Math.min(needed,45)<55){newPage();draw(section.title+' (continued)',margin,y,12,bold);y-=21;drawHeader();}
    const capacity=Math.max(1,Math.floor((y-55-15)/lineHeight)),take=Math.min(remaining,capacity),rowHeight=take*lineHeight+15;
    if(index%2===0)page.drawRectangle({x:margin,y:y-rowHeight,width:bodyWidth,height:rowHeight,color:light});
    let x=margin;lines.forEach((values,i)=>{values.slice(offset,offset+take).forEach((v,n)=>draw(v,x+7,y-12-n*lineHeight,fontSize));x+=widths[i];});
    page.drawLine({start:{x:margin,y:y-rowHeight},end:{x:width-margin,y:y-rowHeight},thickness:.35,color:line});
    y-=rowHeight;offset+=take;
   }
  });y-=27;
 }
 for(const section of report.tables)table(section);
 pdf.getPages().forEach((p,index)=>{
  page=p;page.drawLine({start:{x:margin,y:37},end:{x:width-margin,y:37},thickness:.5,color:line});
  draw(customerCopy?'HH MEDICS | Customer copy':'HH MEDICS | Confidential business information',margin,23,7,regular,muted);
  const generated=`Generated: ${report.generated}`;
  draw(generated,(width-regular.widthOfTextAtSize(generated,7))/2,23,7,regular,muted);
  const count=`Page ${index+1} of ${pdf.getPageCount()}`;
  draw(count,width-margin-regular.widthOfTextAtSize(count,7),23,7,regular,muted);
 });
 return pdf.save();
}
