import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
dotenv.config({path:'.env.local',quiet:true});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await client.connect();await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='10s'");
 await client.query('LOCK TABLE shops IN SHARE ROW EXCLUSIVE MODE');
 await client.query('LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE');
 await client.query(readFileSync(new URL('../database/legacy-invoice-reference.sql',import.meta.url),'utf8'));
 const financials=()=>client.query('SELECT id,shop_id,delivery_id,total,paid_total,credit_total FROM invoices ORDER BY id');
 const before=(await financials()).rows;
 const invoices=(await client.query("SELECT id,shop_id,invoice_no FROM invoices WHERE invoice_no ~ '^INV-[0-9]+$' AND legacy_invoice_no IS NULL ORDER BY shop_id,id")).rows;
 for(const invoice of invoices){
  const store=(await client.query('UPDATE shops SET invoice_sequence=invoice_sequence+1 WHERE id=$1 RETURNING store_code,invoice_sequence::text AS sequence',[invoice.shop_id])).rows[0];
  const number=`${store.store_code}-INV-${store.sequence.padStart(4,'0')}`;
  await client.query('UPDATE invoices SET legacy_invoice_no=invoice_no,invoice_no=$1 WHERE id=$2',[number,invoice.id]);
 }
 assert.deepEqual((await financials()).rows,before);
 await client.query('COMMIT');console.log(`Updated ${invoices.length} existing invoice numbers. Original references and all financial balances were retained.`);
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error(error.message||error.code);process.exitCode=1;}finally{await client.end().catch(()=>{});}
