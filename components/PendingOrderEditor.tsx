import {query} from '@/lib/db';
import {OrderItemsEditor} from './OrderItemsEditor';
export async function PendingOrderEditor({orderId,initial}:{orderId:string;initial:{batch:string;qty:number}[]}){
 const batches=await query(`SELECT b.id,p.name,b.batch_number,b.quantity_on_hand,w.name AS warehouse FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id WHERE (p.active AND w.active AND (b.expiry_date IS NULL OR b.expiry_date>=CURRENT_DATE)) OR b.id=ANY($1::bigint[]) ORDER BY p.name,b.id`,[initial.map(i=>i.batch)]);
 return <details className="card section-gap"><summary>Edit pending order products & quantities</summary><p className="compact-note">Existing lines keep their saved retail price and product cost. Newly added batches use current prices. Stock is checked at dispatch. Reducing a prepaid order may create a refundable customer balance.</p><OrderItemsEditor orderId={orderId} initial={initial} batches={batches.map(b=>({id:String(b.id),label:`${b.name} / ${b.batch_number} / ${b.warehouse} / stock ${b.quantity_on_hand}`}))}/></details>;
}
