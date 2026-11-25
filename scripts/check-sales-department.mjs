// Read-only smoke checks against a locally running application and its configured database.
import dotenv from 'dotenv';
import pg from 'pg';
import {SignJWT} from 'jose';
dotenv.config({path:'.env.local',quiet:true});
const base=process.argv[2]||process.env.SALES_CHECK_URL||'http://localhost:3012';
if(!new URL(base).hostname.match(/^(localhost|127\.0\.0\.1)$/))throw new Error('Smoke checks require a localhost application URL.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
try{
 await client.connect();
 const admin=(await client.query("SELECT id FROM users WHERE role='ADMIN' AND active ORDER BY id LIMIT 1")).rows[0];
 if(!admin)throw new Error('An active administrator is required for read-only smoke checks.');
 const token=await new SignJWT({uid:String(admin.id)}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
 const routes=['/sales-team','/sales-team/orders','/sales-team/agents','/sales-team/brokers','/sales-team/shop-brokers','/sales/new','/sales-team/follow-ups','/sales-team/commissions','/sales-team/reports','/sales-team/new','/api/sales-team/export','/agent-login'];
 const order=(await client.query('SELECT id FROM customer_orders ORDER BY id DESC LIMIT 1')).rows[0];
 const agent=(await client.query('SELECT id FROM sales_agents ORDER BY id DESC LIMIT 1')).rows[0];
 if(order)routes.push('/sales-team/'+order.id,'/sales-team/'+order.id+'/print');
 if(agent)routes.push('/sales-team/agents/'+agent.id);
 for(const route of routes){
  const response=await fetch(base+route,{headers:{Cookie:'cdc_session='+token},redirect:'manual'});
  const body=await response.text();
  if(response.status!==200 || body.includes('"digest":"') || body.includes('Application error:'))throw new Error('Failed department route check: '+route+' (HTTP '+response.status+')');
  if(route.includes('/api/')&&!response.headers.get('content-type')?.includes('text/csv'))throw new Error('CSV content type check failed.');
  console.log('PASS '+route.replace(/\/\d+/g,'/[id]'));
 }
 const anonymous=await fetch(base+'/sales-team',{redirect:'manual'});
 if(![303,307,308].includes(anonymous.status)||!anonymous.headers.get('location')?.includes('/login'))throw new Error('Anonymous access must redirect to login.');
 console.log('PASS anonymous access protection');
 console.log(`Read-only smoke checks passed (${routes.length} authenticated routes). No business records changed.`);
}catch(error){console.error(error.message);process.exitCode=1;}finally{await client.end().catch(()=>{});}
