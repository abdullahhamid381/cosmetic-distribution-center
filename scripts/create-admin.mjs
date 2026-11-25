import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
dotenv.config({ path: '.env.local', override: true });
const {DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME} = process.env;
if (!DATABASE_URL || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD || BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
  throw new Error('Set DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, and a BOOTSTRAP_ADMIN_PASSWORD of 12+ chars privately in .env.local');
}
const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: true } });
try {
  await client.connect();
  const hash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  await client.query(
    `INSERT INTO users(full_name,email,password_hash,role) VALUES ($1,$2,$3,'ADMIN')
     ON CONFLICT(email) DO NOTHING`,
    [BOOTSTRAP_ADMIN_NAME || 'Business Owner', BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(), hash]
  );
  console.log('Admin bootstrap checked. If the email already existed, it was not modified. Remove BOOTSTRAP_ADMIN_PASSWORD from .env.local.');
} finally { await client.end().catch(()=>{}); }
