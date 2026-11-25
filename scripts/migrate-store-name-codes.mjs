import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
dotenv.config({path:'.env.local',quiet:true});
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await client.connect();await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='10s'");
 await client.query('LOCK TABLE shops IN SHARE ROW EXCLUSIVE MODE');await client.query('LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE');
 const snapshot=async()=>({invoices:(await client.query('SELECT id,shop_id,total,paid_total,credit_total,legacy_invoice_no FROM invoices ORDER BY id')).rows,counters:(await client.query('SELECT id,invoice_sequence FROM shops ORDER BY id')).rows});
 const before=await snapshot();
 await client.query(readFileSync(new URL('../database/store-name-codes.sql',import.meta.url),'utf8'));
 const cases=[['Haq Bahoo Cosmetics',1,'HBC-000001'],['Nasir Cosmetics',2,'NC-000002'],['Haq Bahoo Cosmetics',3,'HBC-000003'],['!!!',4,'STORE-000004']];
 for(const [name,id,expected] of cases)assert.equal((await client.query('SELECT store_name_code($1,$2) AS code',[name,id])).rows[0].code,expected);
 assert.deepEqual(await snapshot(),before);
 await client.query('COMMIT');
 console.log('Store-name codes applied. Financial balances and invoice counters unchanged.');
 console.log(JSON.stringify((await client.query('SELECT s.shop_name,i.invoice_no FROM invoices i JOIN shops s ON s.id=i.shop_id ORDER BY i.id')).rows));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error.message||error.code);process.exitCode=1;}finally{await client.end().catch(()=>{});}
