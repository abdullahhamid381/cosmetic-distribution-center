import {DepartmentForm} from '@/components/DepartmentForm';
import {PaymentReceiptInput} from '@/components/PaymentReceiptInput';
import {attachBrokerPayoutReceipt} from '@/app/broker-actions';
import {formatDate,money} from '@/lib/utils';

export function BrokerPayoutTable({payouts,allowUpload=true,receiptIdPrefix="broker-receipt"}:{payouts:Record<string,any>[];allowUpload?:boolean;receiptIdPrefix?:string}){
 if(!payouts.length)return <div className="empty">No broker payments recorded in this account.</div>;
 return <div className="table-wrap section-gap"><table><thead><tr><th>Payment receipt</th><th>Broker / account</th><th>Payment date / day / time</th><th>Amount paid</th><th>Balance before / after payment</th><th>Method / reference / notes</th><th>Recorded at / by</th><th>Uploaded receipt</th></tr></thead><tbody>{payouts.map(p=>{
  const receiptPath=`/api/broker-payouts/${p.id}/receipt`;
  const source=p.broker_source==='SALES'?'Sales broker':p.broker_source==='SHOP'?'Shop broker':'Unassigned legacy payout';
  return <tr key={p.id}><td><b>BP-{p.id}</b></td><td>{p.full_name||'Broker'}<div className="muted">{source}</div></td><td>{formatDate(p.payment_date)}<div>{p.payment_day||'Day not recorded'}</div><div className="muted">{p.payment_time?`${String(p.payment_time).slice(0,8)} PKT`:'Payment time not recorded'}</div></td><td><b>{money(p.amount)}</b></td><td><div>Before: {p.balance_before==null?'Not recorded':money(p.balance_before)}</div><div>After: {p.balance_after==null?'Not recorded':money(p.balance_after)}</div><small>Balance saved at payment time</small></td><td>{p.method}<div className="mono">{p.reference||'No reference'}</div><div className="muted">{p.note||'No notes'}</div></td><td>{p.recorded_at?`${p.recorded_at} PKT`:'Recorded time not available'}<div className="muted">{p.recorded_by||'Not recorded'}</div></td><td>{p.receipt_name?<><a className="btn outline" href={receiptPath} target="_blank" rel="noopener noreferrer">View receipt</a>{' '}<a className="btn outline" href={receiptPath+'?download=1'}>Download</a><div className="muted">{p.receipt_name}</div></>:<div className="muted">No receipt uploaded</div>}{allowUpload&&<details className="section-gap"><summary>{p.receipt_name?'Replace receipt':'Upload receipt'}</summary><DepartmentForm action={attachBrokerPayoutReceipt} submitLabel="Save receipt"><input type="hidden" name="payout_id" value={p.id}/><PaymentReceiptInput id={receiptIdPrefix+'-'+p.id} required/></DepartmentForm></details>}</td></tr>;
 })}</tbody></table></div>;
}
