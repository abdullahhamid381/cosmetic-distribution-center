import 'dotenv/config';
import dotenv from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'node:fs';
dotenv.config({ path: '.env.local', override: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required in .env.local');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
try {
  await client.connect();
  await client.query('BEGIN');
  if (!process.argv.includes('--field-sales-only')) {
    await client.query(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8'));
  }
  await client.query(readFileSync(new URL('../database/field-sales.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Database schema created/updated successfully.');
} catch(e) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('Database migration failed:', e.message || e.code || 'Unknown database error');
  process.exitCode = 1;
} finally { await client.end().catch(()=>{}); }
