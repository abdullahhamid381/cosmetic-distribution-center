'use server';

import {unstable_rethrow} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {recordFieldPayment} from './actions';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {assertFieldSeller, fieldOwner, lockFieldShop, recordFieldAudit} from '@/lib/field-sales';
import {integer, str} from '@/lib/utils';
import type {DepartmentFormState} from '@/components/DepartmentForm';

const contacts = z.object({
  shop_name: z.string().min(1).max(140),
  contact_name: z.string().max(120),
  phone: z.string().max(40),
  address: z.string().max(300),
  city: z.string().max(100),
});

async function saveFieldChange(save: () => Promise<string>): Promise<DepartmentFormState> {
  try {
    const success = await save();
    revalidatePath('/field');
    revalidatePath('/field/access');
    revalidatePath('/shops');
    return {success};
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) return {error: 'Check the required fields and entered values.'};
    const dbError = error as {code?: string};
    if (dbError.code) {
      console.error('Field sales write failed', dbError.code);
      return {error: 'The record could not be saved. Try again or contact your manager.'};
    }
    return {error: error instanceof Error ? error.message : 'The record could not be saved.'};
  }
}

export async function saveFieldShop(_: DepartmentFormState, form: FormData) {
  const user = await requireRole('SALES', 'FIELD_SALES', 'ADMIN', 'MANAGER');
  return saveFieldChange(async () => {
    const data = contacts.parse(Object.fromEntries(Object.keys(contacts.shape).map(key => [key, str(form, key)])));
    const id = str(form, 'shop_id') ? integer(form.get('shop_id'), 'Shop') : null;
    await transaction(async tx => {
      const before = id === null ? null : await lockFieldShop(tx, id, user);
      const selectedSeller = str(form, 'assigned_sales_id');
      const assignment = user.role === 'SALES' ? user.id
        : user.role === 'FIELD_SALES' ? before?.assigned_sales_id ?? null
        : selectedSeller==='unassigned' ? null : selectedSeller ? integer(selectedSeller, 'Assigned seller')
          : before?.assigned_sales_id ?? null;
      if (fieldOwner(user) === null && assignment !== null && Number(assignment) !== Number(before?.assigned_sales_id)) {
        await assertFieldSeller(tx, assignment);
      }
      const fields = [data.shop_name, data.contact_name, data.phone, data.address, data.city, assignment];
      const {rows: [shop]} = id === null
        ? await tx.query(`INSERT INTO shops(shop_name,contact_name,phone,address,city,assigned_sales_id)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, fields)
        : await tx.query(`UPDATE shops SET shop_name=$1,contact_name=$2,phone=$3,address=$4,city=$5,assigned_sales_id=$6
          WHERE id=$7 RETURNING id`, [...fields,id]);
      const shopId = Number(shop.id);
      await recordFieldAudit(tx, user, id === null ? 'FIELD_REGISTER_SHOP' : 'FIELD_UPDATE_SHOP', 'shop',
        shopId, shopId, form, {before, changes: {...data, assigned_sales_id: assignment === null ? null : String(assignment)}});
    });
    if (id !== null) return 'Shop details saved.';
    return user.role === 'FIELD_SALES' ? 'Shop registered. Ask an administrator or manager to grant shop access.' : 'Shop registered.';
  });
}

export async function assignFieldShop(_: DepartmentFormState, form: FormData) {
  const user = await requireRole('ADMIN', 'MANAGER');
  return saveFieldChange(async () => {
    const shopId = integer(form.get('shop_id'), 'Shop');
    const selected = str(form, 'assigned_sales_id');
    const seller = selected === 'unassigned' ? null : integer(selected, 'Assigned seller');
    const changed = await transaction(async tx => {
      const shop = await lockFieldShop(tx, shopId, user);
      const current = shop.assigned_sales_id === null ? null : Number(shop.assigned_sales_id);
      const expected = str(form, 'previous_seller_id');
      if (seller === current) return false;
      if (String(current ?? '') !== expected) throw new Error('The assignment has changed. Refresh the page and try again.');
      if (seller !== null) await assertFieldSeller(tx, seller);
      await tx.query('UPDATE shops SET assigned_sales_id=$1 WHERE id=$2', [seller, shopId]);
      await recordFieldAudit(tx,user,'FIELD_ASSIGN_SHOP','shop',shopId,shopId,form,{
        before:{assigned_sales_id:current},
        changes:{assigned_sales_id:seller},
      });
      return true;
    });
    return !changed ? 'Shop access is already set.' : seller === null ? 'Shop access removed.' : 'Shop access updated.';
  });
}

export async function bookFieldStock(_: DepartmentFormState, form: FormData) {
  const user = await requireRole('SALES', 'FIELD_SALES', 'ADMIN', 'MANAGER');
  return saveFieldChange(async () => {
    const shopId = integer(form.get('shop_id'), 'Shop');
    const products = form.getAll('product_id');
    const quantities = form.getAll('quantity');
    if (!products.length || products.length > 30 || products.length !== quantities.length) {
      throw new Error('Add between 1 and 30 products.');
    }
    const items = products.map((product, index) => ({
      productId: integer(product, 'Product'),
      quantity: integer(quantities[index], 'Quantity'),
    }));
    if (items.some(item => item.quantity > 1000000) || new Set(items.map(item => item.productId)).size !== items.length) {
      throw new Error('Choose each product once and enter a valid quantity.');
    }
    const note = z.string().max(500).parse(str(form, 'note'));
    await transaction(async tx => {
      await lockFieldShop(tx, shopId, user);
      const ids = items.map(item => item.productId);
      const result = await tx.query('SELECT id FROM products WHERE active AND id=ANY($1::bigint[]) FOR SHARE', [ids]);
      if (result.rows.length !== ids.length) throw new Error('Choose active products.');
      const {rows: [booking]} = await tx.query(`INSERT INTO field_stock_bookings(shop_id,created_by,items,note)
        VALUES($1,$2,$3,$4) RETURNING id`, [shopId, user.id, JSON.stringify(items),note]);
      await recordFieldAudit(tx, user, 'FIELD_BOOK_STOCK', 'field_booking', Number(booking.id), shopId, form, {items});
    });
    return 'Booking submitted for dispatch.';
  });
}

export async function cancelFieldBooking(_: DepartmentFormState, form: FormData) {
  const user = await requireRole('ADMIN', 'MANAGER');
  return saveFieldChange(async () => {
    const reason = z.string().min(1).max(300).parse(str(form, 'reason'));
    const id = integer(form.get('booking_id'), 'Booking');
    await transaction(async tx => {
      const {rows: [booking]} = await tx.query(`UPDATE field_stock_bookings SET status='CANCELLED',updated_at=now()
        WHERE id=$1 AND status='PENDING' RETURNING shop_id`, [id]);
      if (!booking) throw new Error('This booking is no longer pending.');
      await recordFieldAudit(tx, user, 'FIELD_CANCEL_BOOKING', 'field_booking', id, Number(booking.shop_id), form, {reason});
    });
    return 'Booking cancelled.';
  });
}

export async function collectFieldPayment(_: DepartmentFormState, form: FormData) {
  return saveFieldChange(async () => {
    await recordFieldPayment(form);
    return 'Payment recorded.';
  });
}
