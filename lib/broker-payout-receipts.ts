import type {PoolClient} from 'pg';
import type {readPaymentReceipt} from './payment-receipts';

export async function saveBrokerPayoutReceipt(tx:PoolClient,payoutId:number,receipt:NonNullable<Awaited<ReturnType<typeof readPaymentReceipt>>>,userId:number){
 await tx.query(`INSERT INTO broker_payout_receipts(payout_id,file_name,content_type,file_data,uploaded_by)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(payout_id) DO UPDATE SET
 file_name=EXCLUDED.file_name,content_type=EXCLUDED.content_type,file_data=EXCLUDED.file_data,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=NOW()`,[payoutId,receipt.name,receipt.mime,receipt.data,userId]);
}
