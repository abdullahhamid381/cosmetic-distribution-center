'use server';
import {readPaymentReceipt} from '@/lib/payment-receipts';
import {saveBrokerPayoutReceipt} from '@/lib/broker-payout-receipts';
import {brokerPaymentTime} from '@/lib/broker-payment-time';
import {requireRole} from '@/lib/auth';
import {transaction} from '@/lib/db';
import {required,str,integer,validatePct,amount} from '@/lib/utils';
import {orderFinancials,commissionBalance,validDate,pakistanToday,paymentMethods} from '@/lib/sales-team';
import {brokerCollectionAccount,brokerCustomerPending,type ShopBrokerAmounts} from '@/lib/shop-broker';
import {revalidatePath} from 'next/cache';
import {unstable_rethrow} from 'next/navigation';
import type {DepartmentFormState} from '@/components/DepartmentForm';
class BrokerInputError extends Error {}
async function run(work:()=>Promise<void>):Promise<DepartmentFormState>{try{await work();revalidatePath('/sales-team','layout');revalidatePath('/agent','layout');return {success:'Saved successfully.'};}catch(e){unstable_rethrow(e);return {error:e instanceof BrokerInputError?e.message:'Unable to save. Check your entries and permissions.'};}}
export async function saveBroker(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER');const name=required(f,'full_name'),pct=validatePct(required(f,'commission_pct')),id=str(f,'broker_id')?integer(f.get('broker_id'),'Broker'):null;
 await transaction(async tx=>{
  const row=id?(await tx.query('UPDATE sales_brokers SET full_name=$1,phone=$2,email=$3,commission_pct=$4,active=$5 WHERE id=$6 RETURNING id',[name,str(f,'phone'),str(f,'email'),pct,f.get('active')==='on',id])).rows[0]:(await tx.query('INSERT INTO sales_brokers(full_name,phone,email,commission_pct,active) VALUES($1,$2,$3,$4,$5) RETURNING id',[name,str(f,'phone'),str(f,'email'),pct,f.get('active')==='on'])).rows[0];
  if(!row)throw new BrokerInputError('Broker not found.');
  await tx.query('INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,$2,\'sales_broker\',$3,$4)',[user.id,id?'UPDATE':'CREATE',row.id,JSON.stringify({commission_pct:pct})]);
 });
});}
export async function payBrokerCommission(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS'),id=integer(f.get('broker_id'),'Broker'),value=amount(required(f,'amount')),method=required(f,'method');
 const source=str(f,'broker_source')||'SALES';
 if(!['SALES','SHOP'].includes(source))throw new BrokerInputError('Choose sales broker or shop broker account.');
 if(value<=0)throw new BrokerInputError('Payout must be greater than zero.');
 if(!paymentMethods.filter(m=>m!=='COD').includes(method as Exclude<typeof paymentMethods[number],'COD'>))throw new BrokerInputError('Choose a valid payout method.');
 const day=validDate(required(f,'payment_date'));if(day>pakistanToday())throw new BrokerInputError('Payment date cannot be in the future.');
 let receipt;try{receipt=await readPaymentReceipt(f);}catch(e){throw new BrokerInputError(e instanceof Error?e.message:'Check the receipt upload.');}
 let time;try{time=brokerPaymentTime(day,str(f,'payment_time'));}catch(e){throw new BrokerInputError(e instanceof Error?e.message:'Check the payment time.');}
 await transaction(async tx=>{
  if(!(await tx.query('SELECT id FROM sales_brokers WHERE id=$1 FOR UPDATE',[id])).rows[0])throw new BrokerInputError('Broker not found.');
  const orders=(await tx.query(`SELECT o.*,COALESCE(t.retail_total,0) AS retail_total,COALESCE(t.product_cost,0) AS product_cost,COALESCE(pay.collected,0) AS collected FROM customer_orders o LEFT JOIN LATERAL(SELECT SUM(quantity*retail_price) AS retail_total,SUM(quantity*unit_cost) AS product_cost FROM customer_order_items WHERE order_id=o.id)t ON true LEFT JOIN LATERAL(SELECT SUM(CASE WHEN kind='COLLECTION' THEN amount ELSE -amount END) AS collected FROM customer_order_payments WHERE order_id=o.id) pay ON true WHERE broker_id=$1`,[id])).rows;
  const earned=orders.reduce((sum,o)=>sum+Math.round(orderFinancials(o as Parameters<typeof orderFinancials>[0]).brokerCommission*100),0)/100;
  const shopInvoices=(await tx.query(`SELECT i.id,i.total,i.paid_total,i.credit_total,i.broker_pct,
    COALESCE((SELECT SUM((ii.quantity-COALESCE(r.qty,0))*ii.retail_unit_price)
      FROM invoice_items ii LEFT JOIN LATERAL(SELECT SUM(quantity) AS qty FROM sales_return_items WHERE invoice_item_id=ii.id) r ON true
      WHERE ii.invoice_id=i.id),0) AS retail_net
    FROM invoices i WHERE i.broker_id=$1`,[id])).rows as ShopBrokerAmounts[];
  const paid=Number((await tx.query(`SELECT COALESCE(SUM(amount),0) AS paid FROM broker_commission_payouts WHERE broker_id=$1 AND (broker_source=$2 OR broker_source='LEGACY')`,[id,source])).rows[0].paid);
  const customerPending=orders.reduce((sum,o)=>sum+Math.round(brokerCustomerPending(o as Parameters<typeof brokerCustomerPending>[0])*100),0)/100;
  const account=brokerCollectionAccount(source==='SALES'?earned:0,source==='SHOP'?shopInvoices:[],paid,source==='SALES'?customerPending:0);
  if(Math.round(value*100)>Math.round(account.due*100))throw new BrokerInputError('Payout exceeds the broker balance in the selected broker account after its pending balances and prior payouts.');
  const row=(await tx.query('INSERT INTO broker_commission_payouts(broker_id,amount,method,reference,note,payment_date,created_by,broker_source,payment_time,balance_before,balance_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[id,value,method,str(f,'reference'),str(f,'note'),day,user.id,source,time,account.netBalance,(Math.round(account.netBalance*100)-Math.round(value*100))/100])).rows[0];
  if(receipt)await saveBrokerPayoutReceipt(tx,Number(row.id),receipt,user.id);
  await tx.query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'PAYOUT','broker_commission_payout',$2,$3)",[user.id,row.id,JSON.stringify({broker_id:id,amount:value,broker_source:source,payment_date:day,payment_time:time,balance_before:account.netBalance,balance_after:(Math.round(account.netBalance*100)-Math.round(value*100))/100,receipt_attached:!!receipt})]);
 });
});}

export async function attachBrokerPayoutReceipt(_:DepartmentFormState,f:FormData){return run(async()=>{
 const user=await requireRole('ADMIN','MANAGER','ACCOUNTS'),id=integer(f.get('payout_id'),'Broker payout');
 let receipt;try{receipt=await readPaymentReceipt(f);}catch(e){throw new BrokerInputError(e instanceof Error?e.message:'Check the receipt upload.');}
 if(!receipt)throw new BrokerInputError('Choose a receipt file to upload.');
 await transaction(async tx=>{
  const payout=(await tx.query('SELECT id FROM broker_commission_payouts WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!payout)throw new BrokerInputError('Broker payout not found.');
  await saveBrokerPayoutReceipt(tx,id,receipt,user.id);
  await tx.query("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'ATTACH_RECEIPT','broker_commission_payout',$2,$3)",[user.id,id,JSON.stringify({file_name:receipt.name})]);
 });
});}
