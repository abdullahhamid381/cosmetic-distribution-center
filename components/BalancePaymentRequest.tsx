'use client';
import {BrandLogo} from './BrandLogo';
import {useState} from 'react';
import Link from 'next/link';
import {money} from '@/lib/utils';
import {BankDetails} from './BankDetails';
import type {BankDetails as Bank} from '@/lib/bank-types';
import {validRequestedPayment} from '@/lib/payment-request';

type Invoice={id:number;number:string;shop:string;contact:string;address:string;phone:string;issued:string;due:string;total:number;paid:number;credits:number;balance:number};
export function BalancePaymentRequest({invoice,bank,business,today}:{invoice:Invoice;bank:Bank;business:{name:string;address:string;phone:string};today:string}) {
 const [title,setTitle]=useState('BALANCE PAYMENT REQUEST'),[note,setNote]=useState('Please arrange payment using the bank details below and share your payment receipt with us.');
 const [requested,setRequested]=useState(invoice.balance.toFixed(2)),[payBy,setPayBy]=useState(invoice.due);
 const amount=Number(requested),valid=validRequestedPayment(requested,invoice.balance);
 return <><div className="card no-print"><h2>Customize balance request</h2><p className="card-sub">Request the full balance or a partial payment. This document does not record money received or change the original invoice.</p>
 <div className="form-grid section-gap"><div className="field"><label htmlFor="request-title">Document title</label><input id="request-title" value={title} onChange={e=>setTitle(e.target.value)}/></div>
 <div className="field"><label htmlFor="request-amount">Amount requested (maximum {money(invoice.balance)})</label><input id="request-amount" type="number" min="0.01" max={invoice.balance} step="0.01" value={requested} onChange={e=>setRequested(e.target.value)}/></div>
 <div className="field"><label htmlFor="request-date">Please pay by</label><input id="request-date" type="date" value={payBy} onChange={e=>setPayBy(e.target.value)}/></div>
 <div className="field span-2"><label htmlFor="request-message">Message to shopkeeper</label><textarea id="request-message" value={note} onChange={e=>setNote(e.target.value)}/></div></div>
 {!valid&&<p role="alert" className="notice">Enter an amount above zero and no greater than the remaining balance.</p>}
 <div className="form-actions"><Link className="btn" href={`/invoices/${invoice.id}`}>Back to invoice</Link><button className="btn primary" disabled={!valid} onClick={()=>{if(valid)window.print();}}>Print / Save as PDF</button></div><p className="card-sub">Save as PDF to send to the shopkeeper. After receiving money, open the invoice and use Record Payment. Custom text applies to this preview only.</p></div>
 <article className="print-document section-gap"><div className="invoice-head"><div><BrandLogo className="document-brand-logo"/><div style={{fontSize:28,fontWeight:900}}>{business.name}</div><p>{business.address}<br/>{business.phone}</p></div><div style={{textAlign:'right'}}><h1>{title}</h1><b>Invoice {invoice.number}</b><p>Request date: {today}</p></div></div>
 <div className="invoice-summary"><div><span className="eyebrow">PAYMENT REQUEST TO</span><h2>{invoice.shop}</h2><p>{invoice.contact}<br/>{invoice.address}<br/>{invoice.phone}</p></div><div><p>Invoice issued: <b>{invoice.issued}</b><br/>Original due date: <b>{invoice.due}</b>{payBy&&<><br/>Please pay by: <b>{payBy}</b></>}</p></div></div>
 <table><tbody>{[['Original invoice amount',invoice.total],['Payments already received',invoice.paid],['Return credits',invoice.credits],['Remaining balance',invoice.balance]].map(([label,value])=><tr key={String(label)}><td>{label}</td><td className="align-right"><b>{money(Number(value))}</b></td></tr>)}</tbody></table>
 <div className="invoice-total section-gap"><div className="final"><span>PLEASE PAY</span><b>{valid?money(amount):'Invalid amount'}</b></div></div>
 <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{note}</p><p>Please include <b>{invoice.number}</b> as your payment reference.</p>
 <BankDetails bank={bank}/><p className="muted">This is a payment request against the existing invoice. It is not a payment receipt. Balance shown is current when this document is opened.</p>
 <div className="footer-print"><div>Thank you for your business.</div><div>Authorized signature: ___________________</div></div></article></>;
}
