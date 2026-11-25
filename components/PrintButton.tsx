'use client';
import {Printer as PrintIcon} from 'lucide-react';
import Link from 'next/link';
export function PrintButton(){return <button type="button" className="btn primary" onClick={()=>window.print()}><PrintIcon size={16}/> Print / Save as PDF</button>}
export function Printer(){return <div className="print-actions no-print"><Link className="btn" href="/invoices">← Back</Link><button className="btn primary" onClick={()=>window.print()}><PrintIcon size={16}/> Print / Save as PDF</button></div>}
