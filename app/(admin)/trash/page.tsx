import {restoreRecord} from '@/app/record-actions';
import {requireRole} from '@/lib/auth';
import {query} from '@/lib/db';
import {records} from '@/lib/records';
import {money} from '@/lib/utils';

export default async function Trash({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS');
 const params=await searchParams;
 const allowed=Object.keys(records).filter(entity=>entity!=='deliveries'&&records[entity].roles.includes(user.role));
 const type=params.type==='deliveries'&&allowed.includes('invoices')?'invoices':params.type;
 const warehouse=/^\d{1,18}$/.test(params.warehouse||'')?params.warehouse:'';
 const shop=/^\d{1,18}$/.test(params.shop||'')?params.shop:'';
 const [entries,warehouses,shops]=await Promise.all([
  query(`SELECT t.id,t.entity,t.record_id,t.deleted_at,u.full_name AS deleted_by,
   COALESCE(r.data->>'invoice_no',r.data->>'payment_no',r.data->>'return_no',
    r.data->>'shop_name',r.data->>'name',r.data->>'title',r.data->>'batch_number',r.data->>'full_name') AS label,
   t.snapshot->'delivery'->>'delivery_no' AS delivery_no,
   COALESCE(r.data->>'total',r.data->>'amount',r.data->>'total_credit') AS amount,
   r.data->>'quantity_on_hand' AS batch_quantity,
   (SELECT SUM((item->>'quantity')::integer) FROM jsonb_array_elements(t.snapshot->'items') item) AS units,
   w.name AS warehouse_name,s.shop_name
   FROM record_trash t CROSS JOIN LATERAL (SELECT t.snapshot->'record' AS data) r
   LEFT JOIN users u ON u.id=t.deleted_by
   LEFT JOIN warehouses w ON w.id=COALESCE((t.snapshot->'delivery'->>'warehouse_id')::bigint,
    (r.data->>'warehouse_id')::bigint,CASE WHEN t.entity='warehouses' THEN t.record_id END,
    (SELECT MIN(b.warehouse_id) FROM jsonb_array_elements(t.snapshot->'items') item
      JOIN batches b ON b.id=(item->>'batch_id')::bigint))
   LEFT JOIN shops s ON s.id=COALESCE(r.data->>'shop_id',CASE WHEN t.entity='shops' THEN t.record_id::text END)::bigint
   WHERE t.entity=ANY($1::text[]) AND ($2='' OR t.entity=$2)
    AND ($3='' OR w.id::text=$3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(t.snapshot->'items') item
      JOIN batches b ON b.id=(item->>'batch_id')::bigint WHERE b.warehouse_id::text=$3))
    AND ($4='' OR s.id::text=$4)
   ORDER BY t.deleted_at DESC,t.id DESC`,[allowed,type&&allowed.includes(type)?type:'',warehouse,shop]),
  query('SELECT id,name FROM warehouses ORDER BY name'),
  query('SELECT id,shop_name FROM shops ORDER BY shop_name'),
 ]);
 return <>
  <div className="page-title"><h1>Trash</h1><p>Restore deleted records against the current stock, balances and invoice numbers.</p></div>
  {params.error&&<p className="notice" role="alert">{params.error}</p>}
  {params.restored&&<p className="notice" role="status">{params.restored}</p>}
  <div className="card">
   <form action="/trash" className="form-grid">
    <div className="field"><label htmlFor="trash-type">Record type</label><select id="trash-type" name="type" defaultValue={type||''}>
     <option value="">All record types</option>{allowed.map(entity=><option key={entity} value={entity}>{entity==='invoices'?'Invoices and linked deliveries':records[entity].title}</option>)}
    </select></div>
    <div className="field"><label htmlFor="trash-warehouse">Warehouse</label><select id="trash-warehouse" name="warehouse" defaultValue={warehouse}>
     <option value="">All warehouses</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select></div>
    <div className="field"><label htmlFor="trash-shop">Shop</label><select id="trash-shop" name="shop" defaultValue={shop}>
     <option value="">All shops</option>{shops.map(s=><option key={s.id} value={s.id}>{s.shop_name}</option>)}
    </select></div>
    <div className="field"><button className="btn primary" type="submit">Apply filters</button></div>
   </form>
   <div className="table-wrap section-gap"><table>
    <thead><tr><th>Record</th><th>Shop / Warehouse</th><th>Details</th><th>Deleted</th><th>Action</th></tr></thead>
    <tbody>{entries.map(entry=><tr key={entry.id}>
     <td><strong>{entry.label||`#${entry.record_id}`}</strong><div className="muted">{records[entry.entity].title}{entry.delivery_no&&` / ${entry.delivery_no}`}</div></td>
     <td>{[entry.shop_name,entry.warehouse_name].filter(Boolean).join(' / ')||'—'}</td>
     <td>{entry.amount!==null&&<div>{money(entry.amount)}</div>}{(entry.units??entry.batch_quantity)!==null&&<div>{entry.units??entry.batch_quantity} units</div>}</td>
     <td>{new Date(entry.deleted_at).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})}<div className="muted">{entry.deleted_by}</div></td>
     <td><form action={restoreRecord}><input type="hidden" name="id" value={entry.id}/><input type="hidden" name="entity" value={entry.entity}/><button className="btn outline" type="submit">Restore</button></form></td>
    </tr>)}</tbody>
   </table>{!entries.length&&<div className="empty">No deleted records match these filters.</div>}</div>
  </div>
 </>;
}
