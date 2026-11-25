import 'server-only';
import pg, { type PoolClient, type QueryResultRow } from 'pg';

let pool: pg.Pool | undefined;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing: configure .env.local on the server');
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 120000,
      connectionTimeoutMillis: 20000,
      keepAlive: true,
      ssl: { rejectUnauthorized: true },
    });
    pool.on('error', (error) => console.error('Idle database connection lost:', error.message));
  }
  return pool;
}
export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    throw e;
  } finally { client.release(); }
}
