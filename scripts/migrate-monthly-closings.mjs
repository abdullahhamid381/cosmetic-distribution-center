import dotenv from 'dotenv';
import pg from 'pg';
import {readFileSync} from 'node:fs';
dotenv.config({path:'.env.local',quiet:true});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await client.connect();await client.query('BEGIN');
 await client.query(readFileSync(new URL('../database/monthly-closings.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/monthly-closing-documents.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/monthly-closing-revisions.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/closing-sessions.sql',import.meta.url),'utf8'));
 await client.query('COMMIT');console.log('Monthly closing storage is ready. Existing records were retained.');
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error.message||error.code);process.exitCode=1;}finally{await client.end().catch(()=>{});}
