require('dotenv').config({path:'.env.local',quiet:true});
const {Client}=require('pg');
const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
(async()=>{try{
 await c.connect();const r=await c.query('SELECT month_start::text,scope_key::text,snapshot FROM public.monthly_closing_documents');
 console.log(JSON.stringify(r.rows.map(x=>({month:x.month_start,scope:x.scope_key,financialKeys:Object.keys(x.snapshot.financials||{}),registers:Object.fromEntries(['expenses','goods','payments','returns'].map(k=>[k,Array.isArray(x.snapshot.financials?.[k])?x.snapshot.financials[k].length:typeof x.snapshot.financials?.[k]]))}))));
 const revisions=await c.query('SELECT id,month_start::text,scope_key,reason,snapshot FROM public.monthly_closing_revisions ORDER BY id');
 console.log(JSON.stringify(revisions.rows.map(r=>({id:r.id,month:r.month_start,scope:r.scope_key,reason:r.reason,docs:r.snapshot.documents?.map(d=>({id:d.id,financialKeys:Object.keys(d.snapshot?.financials||{}),shops:d.snapshot?.statements?.map(s=>s.shopName)})),shops:r.snapshot.statements?.map(s=>({id:s.id,name:s.snapshot?.shopName}))}))));
 console.log(JSON.stringify((await c.query('SELECT id,snapshot FROM public.monthly_closings ORDER BY id')).rows.map(r=>({id:r.id,name:r.snapshot?.shopName}))));
}finally{await c.end();}})().catch(()=>{console.error('Snapshot check failed');process.exitCode=1;});
