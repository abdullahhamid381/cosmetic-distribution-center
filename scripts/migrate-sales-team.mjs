import dotenv from 'dotenv';
import pg from 'pg';
import {readFileSync} from 'node:fs';
dotenv.config({path:'.env.local',quiet:true});
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in .env.local');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try {
 await client.connect();
 await client.query('BEGIN');
 await client.query(readFileSync(new URL('../database/sales-team.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/sales-department.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/agent-portal.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/broker-commissions.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/shop-broker.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/product-costs.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/broker-account-sources.sql',import.meta.url),'utf8'));
 await client.query(readFileSync(new URL('../database/broker-payout-details.sql',import.meta.url),'utf8'));
 await client.query('COMMIT');
 console.log('Sales department schema created/updated successfully.');
} catch(error) {
 await client.query('ROLLBACK').catch(()=>{});
 console.error('Sales team migration failed:',error.message);
 process.exitCode=1;
} finally {await client.end().catch(()=>{});}
