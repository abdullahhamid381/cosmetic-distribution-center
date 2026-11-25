import dotenv from 'dotenv';
import pg from 'pg';
import {readFileSync} from 'node:fs';
dotenv.config({path:'.env.local',quiet:true});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await client.connect();await client.query('BEGIN');
 await client.query(readFileSync(new URL('../database/store-invoice-numbers.sql',import.meta.url),'utf8'));
 await client.query('COMMIT');console.log('Store invoice numbering is ready. Existing invoice numbers were retained.');
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error.message||error.code);process.exitCode=1;}finally{await client.end().catch(()=>{});}
