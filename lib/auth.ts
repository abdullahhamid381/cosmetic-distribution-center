import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { query } from './db';
import type { QueryResultRow } from 'pg';
export const ROLE_NAMES = ['ADMIN','MANAGER','WAREHOUSE','SALES','FIELD_SALES','ACCOUNTS','DELIVERY'] as const;
export type Role = typeof ROLE_NAMES[number];
export type CurrentUser = { id: number; name: string; email: string; role: Role };
type DbUser = QueryResultRow & { id: string; full_name: string; email: string; role: Role;session_version:number };
const COOKIE_NAME = 'cdc_session';
function secret() {
  const val = process.env.SESSION_SECRET;
  if (!val || val.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return new TextEncoder().encode(val);
}
export async function createSession(id: number) {
  const [user]=await query('SELECT session_version FROM users WHERE id=$1 AND active=true',[id]);
  if(!user)throw new Error('Account is unavailable.');
  const token = await new SignJWT({ uid: String(id),sv:Number(user.session_version) }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(secret());
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60*60*12, path: '/' });
}
export async function destroySession() { (await cookies()).delete(COOKIE_NAME); }
export const currentUser = cache(async function currentUser(): Promise<CurrentUser | null> {
  const session = (await cookies()).get(COOKIE_NAME)?.value;
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, secret(), { algorithms: ['HS256'] });
    const id = Number(payload.uid);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const users = await query<DbUser>(`SELECT id, full_name, email, role,session_version FROM users WHERE id=$1 AND active=true
     AND (role<>'SALES' OR EXISTS(SELECT 1 FROM sales_agents WHERE user_id=users.id AND active=true))`, [id]);
    if (!users[0] || Number(payload.sv??0)!==Number(users[0].session_version)) return null;
    return { id: Number(users[0].id), name: users[0].full_name, email: users[0].email, role: users[0].role };
  } catch { return null; }
});
export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  return u;
}
export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    if(user.role==='SALES')redirect('/agent');
    if(user.role==='FIELD_SALES')redirect('/field');
    throw new Error('You do not have permission to perform this action.');
  }
  return user;
}
