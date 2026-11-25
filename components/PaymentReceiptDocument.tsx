'use client';
import {BrandLogo} from './BrandLogo';
import {useState} from 'react';
import Link from 'next/link';
import {BankDetails} from './BankDetails';
import type {BankDetails as Bank} from '@/lib/bank-types';
import {money} from '@/lib/utils';

type Payment={id:number;number:string;date:string;amount:number;method:string;reference:string;note:string;staff:string;shop:string;contact:string;address:string;phone:string};
type Allocation={number:string;amount:number;total:number;balance:number};
export function PaymentReceiptDocument({payment,allocations,business,bank}:{bank:Bank;payment:Payment;allocations:Allocation[];business:{name:string;address:string;phone:string}}) {
 const [title,setTitle]=useState('PAYMENT RECEIPT');
 const [name,setName]=useState(business.name),[address,setAddress]=useState(business.address),[phone,setPhone]=useState(business.phone);
 const [note,setNote]=useState(payment.note||'Thank you for your payment.');
 return <><div className="card no-print"><div className="card-header"><div><h2>Customize payment receipt</h2><p className="card-sub">Customize this printout, then print or save it as a PDF. Payment amounts and allocations come from the recorded payment. These display changes apply to this preview only.</p></div></div><div className="form-grid">
 <div className="field"><label htmlFor="receipt-title">Document title</label><input id="receipt-title" value={title} onChange={e=>setTitle(e.target.value)}/></div>
 <div className="field"><label htmlFor="receipt-business">Business name</label><input id="receipt-business" value={name} onChange={e=>setName(e.target.value)}/></div>
 <div className="field"><label htmlFor="receipt-address">Business address</label><input id="receipt-address" value={address} onChange={e=>setAddress(e.target.value)}/></div>
 <div className="field"><label htmlFor="receipt-phone">Business phone</label><input id="receipt-phone" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
 <div className="field span-2"><label htmlFor="receipt-message">Receipt note / message</label><textarea id="receipt-message" value={note} onChange={e=>setNote(e.target.value)}/></div>
 </div><div className="form-actions"><Link className="btn" href="/payments">Back to payments</Link><button className="btn primary" onClick={()=>window.print()}>Print / Save as PDF</button></div></div>
 <article className="print-document section-gap"><div className="invoice-head"><div><BrandLogo className="document-brand-logo"/><div style={{fontSize:28,fontWeight:900,letterSpacing:2,overflowWrap:'anywhere'}}>{name}</div><p>{address}<br/>{phone}</p></div><div style={{textAlign:'right',overflowWrap:'anywhere'}}><h1>{title}</h1><b>{payment.number}</b><p>Payment received</p></div></div>
 <div className="invoice-summary"><div><span className="eyebrow">RECEIVED FROM</span><h2>{payment.shop}</h2><p>{payment.contact}<br/>{payment.address}<br/>{payment.phone}</p></div><div><span className="eyebrow">PAYMENT DETAILS</span><p>Date: <b>{payment.date}</b><br/>Method: <b>{payment.method}</b><br/>Reference: <b>{payment.reference||'—'}</b><br/>Received by: <b>{payment.staff||'—'}</b></p></div></div>
 <div className="invoice-total section-gap"><div className="final"><span>AMOUNT RECEIVED</span><b>{money(payment.amount)}</b></div></div>
 <h2 className="section-gap">Applied to invoices</h2><div className="table-wrap"><table><thead><tr><th>Invoice</th><th className="align-right">Invoice total</th><th className="align-right">This payment</th><th className="align-right">Current balance</th></tr></thead><tbody>{allocations.map((a,index)=><tr key={index}><td>{a.number}</td><td className="align-right">{money(a.total)}</td><td className="align-right">{money(a.amount)}</td><td className="align-right">{money(a.balance)}</td></tr>)}</tbody></table></div>
 <p className="muted">Balances reflect the current invoice balances at the time this receipt is opened.</p>
 {note&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{note}</p>}
 <BankDetails bank={bank}/><div className="footer-print"><div>Customer signature: ___________________</div><div>Authorized signature: ___________________</div></div></article></>;
}
