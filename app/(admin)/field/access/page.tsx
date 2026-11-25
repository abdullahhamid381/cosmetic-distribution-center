import Link from 'next/link';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {activeFieldSeller} from '@/lib/field-sales';
import {roleLabel} from '@/lib/utils';
import {assignFieldShop} from '@/app/field-sales-actions';
import {DepartmentForm} from '@/components/DepartmentForm';
import '../../sales-team/sales-department.css';

const pageSize = 25;

export default async function FieldShopAccess({searchParams}: {
  searchParams: Promise<{q?:string; seller?:string; page?:string}>;
}) {
  await requireRole('ADMIN','MANAGER');
  const params = await searchParams;
  const term = typeof params.q==='string' ? params.q.trim().slice(0,100) : '';
  const sellers = await query<{id:string;full_name:string;role:string}>(`SELECT u.id,u.full_name,u.role
    FROM users u WHERE ${activeFieldSeller} ORDER BY u.full_name,u.id`);
  const seller = params.seller==='unassigned' || sellers.some(person=>person.id===params.seller) ? params.seller ?? '' : '';
  const shopFilter = `FROM shops s LEFT JOIN users u ON u.id=s.assigned_sales_id
    WHERE s.active AND ($1='' OR strpos(lower(concat_ws(' ',s.shop_name,s.city)),lower($1))>0)
    AND ($2::bigint IS NULL OR s.assigned_sales_id=$2)
    AND (NOT $3::boolean OR s.assigned_sales_id IS NULL)`;
  const filters = [term,seller&&seller!=='unassigned'?seller:null,seller==='unassigned'];
  const [count] = await query<{total:string}>(`SELECT COUNT(*) AS total ${shopFilter}`,filters);
  const total = Number(count.total);
  const maxPage = Math.max(1,Math.ceil(total/pageSize));
  const requested = Number(params.page);
  const page = Number.isSafeInteger(requested) ? Math.min(maxPage,Math.max(1,requested)) : 1;
  const shops = await query<{id:string;shop_name:string;city:string|null;assigned_sales_id:string|null;seller:string|null}>(
    `SELECT s.id,s.shop_name,s.city,s.assigned_sales_id,u.full_name AS seller ${shopFilter}
    ORDER BY s.shop_name,s.id LIMIT $4 OFFSET $5`,[...filters,pageSize,(page-1)*pageSize],
  );
  const href = (number:number) => '/field/access?'+new URLSearchParams({q:term,seller,page:String(number)});

  return <div className="sales-department">
    <div className="page-title-row">
      <div className="page-title"><h1>Field Sales Shop Access</h1>
        <p>Assign or remove the salesperson who can book stock, collect payments, and share PDFs for each shop.</p>
      </div>
      <Link className="btn" href="/field">Back to Field Sales</Link>
    </div>
    <form className="card inline-form" action="/field/access">
      <label className="field">Shop or city<input name="q" defaultValue={term} maxLength={100}/></label>
      <label className="field">Current access<select name="seller" defaultValue={seller}>
        <option value="">All shops</option>
        <option value="unassigned">Unassigned shops</option>
        {sellers.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}
      </select></label>
      <button className="btn primary" type="submit">Filter shops</button>
    </form>
    <section className="card section-gap">
      <div className="card-header"><h2>Active shops</h2><span className="badge blue">{total} shops</span></div>
      {!sellers.length && <p className="notice">Create a Field Sales account in Staff &amp; Roles before assigning access.</p>}
      {!shops.length ? <p className="empty">No shops match the filters.</p> : <div className="table-wrap">
        <table>
          <thead><tr><th>Shop</th><th>Current salesperson</th><th>Change access</th></tr></thead>
          <tbody>{shops.map(shop=><tr key={shop.id}>
            <td><Link href={'/field?shop='+shop.id}><strong>{shop.shop_name}</strong></Link>{shop.city&&<div className="muted">{shop.city}</div>}</td>
            <td>{shop.seller || 'Unassigned'}</td>
            <td><DepartmentForm key={shop.assigned_sales_id??'unassigned'} action={assignFieldShop}
              className="inline-form" submitLabel="Save access">
              <input type="hidden" name="shop_id" value={shop.id}/>
              <input type="hidden" name="previous_seller_id" value={shop.assigned_sales_id??''}/>
              <label className="field">Salesperson<select name="assigned_sales_id"
                defaultValue={shop.assigned_sales_id??'unassigned'} aria-label={'Salesperson for '+shop.shop_name} required>
                <option value="unassigned">Unassigned</option>
                {shop.assigned_sales_id&&!sellers.some(person=>person.id===shop.assigned_sales_id) &&
                  <option value={shop.assigned_sales_id} disabled>{shop.seller || 'Current seller'} (unavailable)</option>}
                {sellers.map(person=><option key={person.id} value={person.id}>{person.full_name} · {roleLabel(person.role)}</option>)}
              </select></label>
            </DepartmentForm></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {maxPage>1&&<nav className="actions section-gap" aria-label="Shop access pages">
        {page>1&&<Link className="btn" href={href(page-1)}>Previous</Link>}
        <span>Page {page} of {maxPage}</span>
        {page<maxPage&&<Link className="btn" href={href(page+1)}>Next</Link>}
      </nav>}
    </section>
  </div>;
}
