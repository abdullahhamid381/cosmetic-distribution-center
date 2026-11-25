import {query} from './db';
import type {ReportDocument} from './report-document';

export type AuditFilterInput={from?:string;to?:string;actor?:string;action?:string;entity?:string;q?:string;page?:string};
export function auditFilters(input:AuditFilterInput){
 const read=(key:keyof AuditFilterInput)=>typeof input[key]==='string'?input[key]!.trim():'';
 const filters={from:read('from'),to:read('to'),actor:read('actor'),action:read('action'),entity:read('entity'),q:read('q')};
 const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const error=(filters.from&&!validDate(filters.from))||(filters.to&&!validDate(filters.to))?'Enter valid dates.':filters.from&&filters.to&&filters.from>filters.to?'From date must be on or before To date.':filters.actor&&(!/^\d+$/.test(filters.actor)||!Number.isSafeInteger(Number(filters.actor))||Number(filters.actor)<1)?'Choose a valid staff member.':filters.action.length>100||filters.entity.length>100||filters.q.length>200?'Search or filter text is too long.':'';
 return {...filters,error};
}
const sensitive=/password|secret|token|authorization|cookie|credential|private.?key/i;
export function safeAuditDetails(value:unknown):unknown{
 if(Array.isArray(value))return value.map(safeAuditDetails);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,sensitive.test(key)?'[REDACTED]':safeAuditDetails(v)]));
 return value;
}
export function detailRows(value:unknown,prefix=''):string[][]{
 if(value&&typeof value==='object'){
  const entries=Object.entries(value);if(!entries.length)return [[prefix||'Details',Array.isArray(value)?'[]':'{}']];
  return entries.flatMap(([key,v])=>detailRows(v,prefix?`${prefix}.${key}`:key));
 }
 return [[prefix||'Details',value===null?'Not set':value===undefined?'Not recorded':String(value)]];
}
export function changedRows(details:unknown):string[][]{
 if(!details||typeof details!=='object')return [];
 const {before,changes}=details as {before?:Record<string,unknown>;changes?:Record<string,unknown>};
 if(!before||!changes||typeof before!=='object'||typeof changes!=='object')return [];
 return Object.entries(changes).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(before[key])).map(([key,value])=>[key,before[key]===undefined?'Not recorded':JSON.stringify(before[key]),JSON.stringify(value)??'Not recorded']);
}
export type AuditEvent={id:string;timestamp:string;actor:string;email:string;role:string;action:string;entity:string;recordId:string;details:unknown;source:string};
export async function auditReport(filters:ReturnType<typeof auditFilters>){
 if(filters.error)throw new Error(filters.error);
 const params=[filters.from||null,filters.to||null,filters.actor||null,filters.action||null,filters.entity||null,filters.q||null];
 const rows=await query(`WITH events AS (
  SELECT 'A-'||a.id AS id,a.created_at,a.user_id,a.action,a.entity,a.entity_id,a.details,'Operational audit' AS source
  FROM public.audit_logs a
  UNION ALL
  SELECT 'P-'||p.id,p.created_at,p.changed_by,'PRICE_CHANGE','pricing',p.shop_id,
  jsonb_build_object('shopId',p.shop_id,'shop',s.shop_name,'productId',p.product_id,'product',COALESCE(pr.name,'Default shop discount'),'oldPercentage',p.old_pct,'newPercentage',p.new_pct),'Pricing history'
  FROM price_audit p LEFT JOIN shops s ON s.id=p.shop_id LEFT JOIN products pr ON pr.id=p.product_id
 ) SELECT e.*,COALESCE(u.full_name,'System / unavailable') AS actor,u.email,u.role,
 to_char(e.created_at AT TIME ZONE 'Asia/Karachi','YYYY-MM-DD HH24:MI:SS')||' PKT' AS timestamp
 FROM events e LEFT JOIN users u ON u.id=e.user_id
 WHERE ($1::date IS NULL OR (e.created_at AT TIME ZONE 'Asia/Karachi')::date >= $1)
 AND ($2::date IS NULL OR (e.created_at AT TIME ZONE 'Asia/Karachi')::date <= $2)
 AND ($3::bigint IS NULL OR e.user_id=$3) AND ($4::text IS NULL OR e.action=$4)
 AND ($5::text IS NULL OR e.entity=$5)
 AND ($6::text IS NULL OR strpos(lower(concat_ws(' ',e.id,u.full_name,e.action,e.entity,e.entity_id::text,e.details::text)),lower($6))>0)
 ORDER BY e.created_at DESC,e.id DESC`,params);
 return rows.map((r):AuditEvent=>({id:String(r.id),timestamp:String(r.timestamp),actor:String(r.actor),email:r.email?String(r.email):'Not recorded',role:r.role?String(r.role):'Not recorded',action:String(r.action),entity:String(r.entity),recordId:r.entity_id===null?'Not recorded':String(r.entity_id),details:safeAuditDetails(r.details),source:String(r.source)}));
}
export function auditDocument(events:AuditEvent[],filters:ReturnType<typeof auditFilters>,preparedBy:string,now=new Date()):ReportDocument{
 const group=(key:'action'|'entity'|'actor')=>{const counts=new Map<string,number>();for(const e of events)counts.set(e[key],(counts.get(e[key])||0)+1);return [...counts].sort((a,b)=>b[1]-a[1]).map(([name,count])=>[name,String(count)]);};
 return {title:'Detailed audit report',scope:[filters.actor&&`Staff ID ${filters.actor}`,filters.action,filters.entity,filters.q&&`Search: ${filters.q}`].filter(Boolean).join(' | ')||'All staff and activities',period:`${filters.from||'Beginning'} to ${filters.to||'Latest'}`,preparedBy,
 generated:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'medium'}).format(now)+' PKT',
 metrics:[{label:'Total recorded events',value:String(events.length)},{label:'Operational events',value:String(events.filter(e=>e.source==='Operational audit').length)},{label:'Pricing events',value:String(events.filter(e=>e.source==='Pricing history').length)}],
 notes:['Source: saved operational audit logs and pricing history. All matching events are included; on-screen pagination does not limit exports.','Operational and pricing entries can describe the same business change; event totals are audit entries, not unique transactions.','Only details captured at the time of an action can be shown. Older entries may have no before/after snapshot. Staff identities and shop/product names are current directory values. Passwords and authentication secrets are redacted.','All timestamps use Pakistan time (Asia/Karachi). Saved monthly closing documents retain their original invoice references.'],
 tables:[{title:'Activity by action',headers:['Action','Events'],widths:[75,25],rows:group('action')},{title:'Activity by record type',headers:['Record type','Events'],widths:[75,25],rows:group('entity')},{title:'Activity by staff member',headers:['Staff member','Events'],widths:[75,25],rows:group('actor')},
 {title:'Complete event register',headers:['Event / Time','Staff / Role','Action / Source','Record type / ID'],widths:[25,27,28,20],rows:events.map(e=>[`${e.id}\n${e.timestamp}`,`${e.actor}\n${e.email}\n${e.role}`,`${e.action}\n${e.source}`,`${e.entity}\nID ${e.recordId}`])},
 ...events.flatMap(e=>{
  const changes=changedRows(e.details),rows=e.details===null||e.details===undefined?[]:detailRows(e.details);
  return [...(changes.length?[{title:`${e.id} - changed values`,note:`${e.timestamp} | ${e.actor} | ${e.action} | ${e.entity} #${e.recordId}`,headers:['Field','Before','After'],widths:[26,37,37],rows:changes}]:[]),
   {title:`${e.id} - full recorded detail`,note:`${e.timestamp} | ${e.actor} | ${e.action} | ${e.entity} #${e.recordId}`,headers:['Field / path','Recorded value'],widths:[32,68],rows:rows.length?rows:[['Details','No additional details were saved for this event.']]}];
 })]};
}
