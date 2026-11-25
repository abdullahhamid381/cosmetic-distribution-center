const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>deps[name]||require(name),out);return out;}
const service=load('lib/audit-report.ts',{'./db':{}}),filters=service.auditFilters({from:'2026-10-01',to:'2026-10-23'});
const events=Array.from({length:5},(_,i)=>({id:`A-${i+1}`,timestamp:'2026-10-23 13:45:00 PKT',actor:'Business Owner',email:'owner@example.test',role:'ADMIN',action:'UPDATE',entity:'invoices',recordId:String(i+1),source:'Operational audit',details:service.safeAuditDetails({before:{invoice_no:'HBC-000001-INV-0001',note:'Original terms',password_hash:'PRIVATE-HASH'},changes:{note:'Revised delivery instructions'},items:[{product:'Glanze Serum',quantity:30,discountPct:40}],password:'PRIVATE-PASSWORD'})}));
const model=service.auditDocument(events,filters,'Owner',new Date('2026-10-23T08:45:00Z'));
test('audit filters reject impossible dates, reversed ranges and invalid staff IDs',()=>{
 for(const f of [{from:'2026-02-30'},{from:'2026-10-24',to:'2026-10-01'},{actor:'1 OR 1=1'},{q:'x'.repeat(201)}])assert.ok(service.auditFilters(f).error);
 assert.equal(filters.error,'');
});
test('deep details preserve arrays and before/after values while recursively removing secrets',()=>{
 const text=JSON.stringify(model);assert.ok(!text.includes('PRIVATE-HASH'));assert.ok(!text.includes('PRIVATE-PASSWORD'));assert.match(text,/REDACTED/);
 assert.ok(model.tables.some(t=>t.rows.some(r=>r.includes('items.0.discountPct')&&r.includes('40'))));
 assert.deepEqual(service.changedRows(events[0].details),[['note','"Original terms"','"Revised delivery instructions"']]);
 assert.ok(model.tables.every(t=>t.widths.reduce((a,b)=>a+b)===100));
});
test('query includes full operational and pricing history, with bound filters and PKT dates',async()=>{
 let calls=0;
 const s=load('lib/audit-report.ts',{'./db':{query:async(sql,args)=>{calls++;assert.match(sql,/UNION ALL/);assert.match(sql,/Asia\/Karachi/);assert.ok(!sql.includes('LIMIT 200'));assert.deepEqual(args,['2026-10-01','2026-10-23',null,null,null,"Owner's invoice"]);return [{id:'A-1',timestamp:'PKT',actor:'Owner',action:'UPDATE',entity:'invoices',entity_id:1,details:{token:'secret'},source:'Operational audit'}];}}});
 const rows=await s.auditReport(s.auditFilters({...filters,q:"Owner's invoice"}));assert.equal(rows[0].details.token,'[REDACTED]');
 await assert.rejects(s.auditReport(s.auditFilters({from:'bad'})));assert.equal(calls,1);
});
test('Excel preserves full detail as literal text, with filtering, frozen headings and print footers',async()=>{
 const {auditExcel}=load('lib/audit-excel.ts',{'./audit-report':service});
 const bytes=await auditExcel(model,events),ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 assert.equal(book.getWorksheet('Event register').rowCount,6);assert.equal(book.getWorksheet('Before and after').rowCount,6);
 const detail=book.getWorksheet('Recorded details');assert.ok(detail.autoFilter);assert.equal(detail.views[0].state,'frozen');assert.match(detail.headerFooter.oddFooter,/Page &P of &N/);assert.match(detail.headerFooter.oddFooter,/PKT/);
 let values='';detail.eachRow(row=>{row.eachCell(cell=>{assert.equal(cell.type===ExcelJS.ValueType.Formula,false);values+=String(cell.value);});});assert.match(values,/items.0.quantity/);assert.ok(!values.includes('PRIVATE-'));
 if(process.env.REPORT_EXPORT_QA){fs.mkdirSync('.tmp/audit-report-qa',{recursive:true});fs.writeFileSync('.tmp/audit-report-qa/audit.xlsx',Buffer.from(bytes));}
});
test('PDF and Word generate detailed multipage audit documents with correct title and footers',async()=>{
 const {reportPdf}=load('lib/report-pdf.ts'),{reportDocx}=load('lib/report-docx.ts');
 const pdf=await reportPdf(model),word=await reportDocx(model),doc=await require('pdf-lib').PDFDocument.load(pdf);
 assert.equal(doc.getTitle(),'HH MEDICS Detailed audit report');assert.ok(doc.getPageCount()>1);
 const zip=await require('jszip').loadAsync(word),xml=await zip.file('word/document.xml').async('string'),footer=await zip.file('word/footer1.xml').async('string');
 assert.match(xml,/A-5 - full recorded detail/);assert.match(xml,/Original terms/);assert.ok(!xml.includes('PRIVATE-'));assert.match(footer,/PKT/);assert.match(footer,/NUMPAGES/);
 if(process.env.REPORT_EXPORT_QA){fs.mkdirSync('.tmp/audit-report-qa',{recursive:true});fs.writeFileSync('.tmp/audit-report-qa/audit.pdf',pdf);fs.writeFileSync('.tmp/audit-report-qa/audit.docx',word);}
});
test('audit download requires administrator role and rejects invalid filters before reading data',async()=>{
 const {NextRequest}=require('next/server');let reads=0,role;
 const route=load('app/api/audit/download/route.ts',{'@/lib/auth':{requireRole:async(...roles)=>{role=roles;return {name:'Owner'};}},'@/lib/audit-report':{...service,auditReport:async()=>{reads++;return events;}}});
 for(const query of ['format=csv','format=pdf&from=bad'])assert.equal((await route.GET(new NextRequest('http://localhost/api/audit/download?'+query))).status,400);
 assert.deepEqual(role,['ADMIN']);assert.equal(reads,0);
 const denied=load('app/api/audit/download/route.ts',{'@/lib/auth':{requireRole:async()=>{throw new Error('Forbidden');}},'@/lib/audit-report':service});
 await assert.rejects(denied.GET(new NextRequest('http://localhost/api/audit/download?format=pdf')),/Forbidden/);
});
