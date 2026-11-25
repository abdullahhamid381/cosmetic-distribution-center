import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});
const tables=['closing_sessions','monthly_closing_revisions','monthly_closing_documents','monthly_closings','manufacturers','warehouses','products','shops','shop_product_rates','price_audit','batches','stock_movements','stock_transfers','deliveries','delivery_items','invoices','invoice_items','payments','payment_allocations','payment_receipts','sales_returns','sales_return_items','expenses','audit_logs','bank_settings'];
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try {
 await client.connect();
 const inventory=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const unexpected=inventory.rows.filter(r=>!['users',...tables].includes(r.tablename));
 if(unexpected.length)throw new Error('Unexpected database tables found; reset stopped for inspection: '+unexpected.map(r=>r.tablename).join(', '));
 await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='10s'");
 await client.query('LOCK TABLE users IN SHARE MODE');
 const accounts=await client.query('SELECT * FROM users ORDER BY id');
 const snapshot=JSON.stringify(accounts.rows);
 const countSql=tables.map(name=>`SELECT '${name}' AS name,COUNT(*)::int AS count FROM "${name}"`).join(' UNION ALL ');
 const before=(await client.query(countSql)).rows;
 console.log(JSON.stringify({loginAccountsPreserved:accounts.rows.length,businessRecords:before},null,2));
 if(process.argv.includes('--execute')) {
  // No CASCADE: an unexpected external reference must fail instead of deleting login data.
  await client.query('TRUNCATE TABLE '+tables.map(name=>'"'+name+'"').join(', ')+' RESTART IDENTITY');
  const remaining=(await client.query(countSql)).rows;
  if(remaining.some(r=>r.count!==0))throw new Error('Business records remain; transaction rolled back');
  if(JSON.stringify((await client.query('SELECT * FROM users ORDER BY id')).rows)!==snapshot)throw new Error('Login records changed; transaction rolled back');
  await client.query('COMMIT');
  console.log('Reset completed. All business tables are empty. All login records and password hashes are unchanged.');
 } else {await client.query('ROLLBACK');console.log('Inspection only. No records changed.');}
} catch(error) {
 await client.query('ROLLBACK').catch(()=>{});
 console.error('Reset stopped:',error.code||error.message);process.exitCode=1;
} finally {await client.end().catch(()=>{});}
