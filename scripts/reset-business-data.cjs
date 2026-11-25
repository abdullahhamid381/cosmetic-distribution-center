// Explicitly requested reset: preserve users and sales-agent portal identities.
const pg=require('pg');
const assert=require('node:assert/strict');
require('dotenv').config({path:'.env.local',quiet:true});
const preserved=['users','sales_agents'];
const allowed=new Set(['manufacturers','warehouses','products','shops','shop_product_rates','price_audit','batches','stock_movements','stock_transfers','deliveries','delivery_items','invoices','invoice_items','payments','payment_allocations','payment_receipts','sales_returns','sales_return_items','expenses','audit_logs','bank_settings','monthly_closings','monthly_closing_documents','monthly_closing_revisions','closing_sessions','customer_orders','customer_order_items','customer_order_history','sales_agent_targets','customer_order_payments','sales_commission_payouts','sales_followups','order_payment_reports','sales_brokers','broker_commission_payouts','broker_payout_receipts']);
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
const quote=name=>'"'+name.replaceAll('"','""')+'"';
(async()=>{try{
 await client.connect();await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='10s'");
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 const targets=tables.filter(t=>!preserved.includes(t));
 assert.ok(targets.length,'No business tables found.');
 for(const t of targets)assert.ok(allowed.has(t),'Unrecognized table: '+t+'; reset stopped for review.');
 const identifiers=targets.map(t=>'public.'+quote(t)).join(',');
 // RESTRICT prevents an unexpected dependency from pulling login data into reset.
 await client.query('LOCK TABLE '+[...targets,...preserved].map(t=>'public.'+quote(t)).join(',')+' IN ACCESS EXCLUSIVE MODE');
 const users=(await client.query('SELECT * FROM public.users ORDER BY id')).rows;
 const agents=(await client.query('SELECT * FROM public.sales_agents ORDER BY id')).rows;
 let removed=0;
 for(const t of targets){const count=Number((await client.query('SELECT COUNT(*) AS n FROM public.'+quote(t))).rows[0].n);removed+=count;console.log(t+': '+count+' records');}
 console.log('Preserve '+users.length+' login accounts and '+agents.length+' sales portal profiles.');
 if(!process.argv.includes('--apply')){await client.query('ROLLBACK');console.log('Preview only; no data changed.');return;}
 await client.query('TRUNCATE TABLE '+identifiers+' RESTART IDENTITY RESTRICT');
 assert.deepEqual((await client.query('SELECT * FROM public.users ORDER BY id')).rows,users,'Login accounts changed.');
 assert.deepEqual((await client.query('SELECT * FROM public.sales_agents ORDER BY id')).rows,agents,'Portal profiles changed.');
 for(const t of targets)assert.equal(Number((await client.query('SELECT COUNT(*) AS n FROM public.'+quote(t))).rows[0].n),0);
 await client.query('COMMIT');
 console.log('Reset complete: '+removed+' business records cleared across '+targets.length+' tables. Login accounts, password hashes, roles, active status and portal profiles verified unchanged.');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error('Reset failed:',e.message);process.exitCode=1;}finally{await client.end().catch(()=>{});}})();
