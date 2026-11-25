import { z } from 'zod';
export const money = (value: number | string | null | undefined) => 'Rs. ' + Number(value || 0).toLocaleString('en-PK', {minimumFractionDigits: 2, maximumFractionDigits: 2});
export const amount = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Enter a valid non-negative amount.');
  return Math.round((n + Number.EPSILON) * 100) / 100;
};
export const cents = (value: number) => Math.round((value+Number.EPSILON)*100);
export const fromCents = (n: number) => (n/100).toFixed(2);
export function integer(value: unknown, name: string, min = 1) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`${name} must be an integer of at least ${min}.`);
  return n;
}
export function str(fd: FormData, key: string) { return String(fd.get(key) || '').trim(); }
export function required(fd: FormData, key: string) { const v = str(fd,key); if(!v) throw new Error(`${key} is required.`); return v; }
export function validatePct(value: unknown) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('Percentage must be between 0 and 100.');
  return Math.round(v*100)/100;
}
export function dateISO(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new Error('Valid YYYY-MM-DD date required'); return value; }
export const roleSchema = z.enum(['ADMIN','MANAGER','WAREHOUSE','SALES','FIELD_SALES','ACCOUNTS','DELIVERY']);
export const roleLabel=(role:string)=>role==='SALES'?'Sales Agent':role==='FIELD_SALES'?'Field Sales':role;
export const formatDate = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleDateString('en-GB') : '—';
