import 'server-only';
import type {CurrentUser} from './auth';
import type {PoolClient} from 'pg';

export type FieldCollectionLine = {
  number: string;
  dueDate: string;
  balanceBeforeCents: number;
  appliedCents: number;
  balanceAfterCents: number;
};

export function fieldOwner(user: CurrentUser) {
  return user.role === 'SALES' || user.role === 'FIELD_SALES' ? user.id : null;
}

export const activeFieldSeller = `u.active AND (u.role='FIELD_SALES' OR (u.role='SALES' AND EXISTS (
  SELECT 1 FROM sales_agents a WHERE a.user_id=u.id AND a.active
)))`;

export async function assertFieldSeller(tx: PoolClient, id: number | string) {
  const result = await tx.query(`SELECT u.id FROM users u WHERE u.id=$1 AND ${activeFieldSeller} FOR SHARE OF u`,[id]);
  if (!result.rows.length) throw new Error('Choose an active Field Sales user or Sales Agent.');
}

export async function lockFieldShop(tx: PoolClient, shopId: number, user: CurrentUser) {
  const {rows: [shop]} = await tx.query(
    `SELECT id,shop_name,contact_name,phone,address,city,assigned_sales_id
    FROM shops WHERE id=$1 AND active AND ($2::bigint IS NULL OR assigned_sales_id=$2) FOR UPDATE`,
    [shopId, fieldOwner(user)],
  );
  if (!shop) throw new Error('Choose an active shop assigned to you.');
  return shop;
}

export function fieldLocation(form: FormData) {
  const values = ['latitude', 'longitude', 'accuracy'].map(name => String(form.get(name) ?? '').trim());
  if (values.every(value => !value)) return null;
  const [latitude, longitude, accuracy] = values.map(Number);
  if (values.some(value => !value) || ![latitude, longitude, accuracy].every(Number.isFinite) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || accuracy > 100000) {
    throw new Error('Location is invalid. Capture it again or remove it.');
  }
  return {latitude, longitude, accuracy};
}

export async function recordFieldAudit(tx: PoolClient, user: CurrentUser, action: string, entity: string,
  id: number, shopId: number, form: FormData, details: Record<string, unknown> = {}) {
  const location = fieldLocation(form);
  await tx.query(
    'INSERT INTO public.audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,$3,$4,$5)',
    [user.id, action, entity, id, JSON.stringify({...details, shopId, source: 'field-sales', ...(location ? {location} : {})})],
  );
}
