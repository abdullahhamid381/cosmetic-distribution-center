import {monthlyReportDocument} from './monthly-report-document';
import {collectionClosing} from './monthly-financials';
import type {SessionSnapshot} from './closing-sessions';
export function sessionReportDocument(snapshot:SessionSnapshot,from:string,to:string,preparedBy:string,scope:string,source:string){
 const document=monthlyReportDocument(snapshot.statements,from.slice(0,7),preparedBy,scope,source,new Date(),snapshot.financials?collectionClosing(snapshot.financials):undefined);
 document.title='Closing session report';document.period=`${from} to ${to}`;
 const replace=(s:string)=>s.replace(/this month/gi,'this period').replace(/current month/gi,'current period').replace(/previous months/gi,'previous periods').replace(/previous month/gi,'previous period').replace(/next month/gi,'next session').replace(/during the month/gi,'during the period');
 document.metrics=document.metrics.map(m=>({...m,label:replace(m.label)}));document.notes=document.notes.map(replace);
 for(const table of document.tables){table.title=replace(table.title);if(table.note)table.note=replace(table.note);table.headers=table.headers.map(replace);table.rows=table.rows.map(r=>r.map(replace));}
 if(!snapshot.financials)document.notes.push('This imported older summary did not capture financial registers. Reopen and close again to save complete goods costs, expense and receipt details.');
 return document;
}
