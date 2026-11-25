import 'server-only';
import {query} from './db';
import type {ShopBrokerAmounts} from './shop-broker';
export type ShopBrokerInvoice=Record<string,any>&ShopBrokerAmounts&{id:string;broker_id:string;broker_name:string;shop_name:string;invoice_no:string;retail_net:string;company_net:string;product_cost:string};
export async function shopBrokerInvoices(brokerId:string|number|null=null,invoiceId:string|number|null=null){
 return query<ShopBrokerInvoice>(`SELECT i.*,s.shop_name,b.full_name AS broker_name,
 COALESCE(t.retail_net,0) AS retail_net,COALESCE(t.company_net,0) AS company_net,COALESCE(t.product_cost,0) AS product_cost,COALESCE(t.shop_pct,0) AS shop_pct
 FROM invoices i JOIN shops s ON s.id=i.shop_id JOIN sales_brokers b ON b.id=i.broker_id
 LEFT JOIN LATERAL(SELECT SUM((ii.quantity-COALESCE(r.qty,0))*ii.retail_unit_price) AS retail_net,
 SUM((ii.quantity-COALESCE(r.qty,0))*COALESCE(ii.company_unit_price,ii.applied_unit_price)) AS company_net,
 SUM((ii.quantity-COALESCE(r.qty,0))*ii.unit_cost) AS product_cost,
 SUM(ii.quantity*ii.retail_unit_price*ii.discount_pct)/NULLIF(SUM(ii.quantity*ii.retail_unit_price),0) AS shop_pct
 FROM invoice_items ii LEFT JOIN LATERAL(SELECT SUM(quantity) AS qty FROM sales_return_items WHERE invoice_item_id=ii.id)r ON true
 WHERE ii.invoice_id=i.id)t ON true
 WHERE ($1::bigint IS NULL OR i.broker_id=$1) AND ($2::bigint IS NULL OR i.id=$2) ORDER BY i.id DESC`,[brokerId,invoiceId]);
}
