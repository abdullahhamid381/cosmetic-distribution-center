const pg=require('pg'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require('dotenv').config({path:'.env.local',quiet:true});
const out={};new Function('exports',ts.transpileModule(fs.readFileSync('lib/store-invoice-number.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(out);
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
(async()=>{try{
 await client.connect();await client.query('BEGIN');
 // All writes are to a temporary copy, never business records or their sequences.
 await client.query('CREATE TEMP TABLE shops (LIKE public.shops INCLUDING ALL) ON COMMIT DROP');
 await client.query('CREATE TEMP TABLE invoices (invoice_no text PRIMARY KEY) ON COMMIT DROP');
 await client.query('CREATE TRIGGER qa_store_code BEFORE INSERT ON shops FOR EACH ROW EXECUTE FUNCTION public.assign_store_name_code()');
 await client.query("INSERT INTO shops(id,shop_name) VALUES(1,'QA Store A'),(2,'QA Store B'),(1000000,'QA Large ID')");
 assert.equal(await out.nextStoreInvoiceNumber(client,1),'QSA-000001-INV-0001');
 assert.equal(await out.nextStoreInvoiceNumber(client,2),'QSB-000002-INV-0001');
 await client.query("INSERT INTO invoices VALUES ('QSA-000001-INV-0001'),('QSA-000001-INV-0003')");
 await client.query('SAVEPOINT failed_invoice');
 assert.equal(await out.nextStoreInvoiceNumber(client,1),'QSA-000001-INV-0002');
 await client.query("DELETE FROM invoices WHERE invoice_no='QSA-000001-INV-0001'");
 assert.equal(await out.nextStoreInvoiceNumber(client,1),'QSA-000001-INV-0001');
 await client.query('ROLLBACK TO SAVEPOINT failed_invoice');
 assert.equal(await out.nextStoreInvoiceNumber(client,1),'QSA-000001-INV-0002');
 assert.equal(await out.nextStoreInvoiceNumber(client,1000000),'QLI-1000000-INV-0001');
 await client.query('ROLLBACK');console.log('Store codes, free numbers, large IDs and rollback verified on temporary data.');
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{await client.end().catch(()=>{});}})();
