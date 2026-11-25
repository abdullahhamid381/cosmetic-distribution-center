import {invoiceBarcode} from '@/lib/invoice-barcode';

export function InvoiceBarcode({invoiceNumber, invoiceId}: {invoiceNumber: string; invoiceId: number}) {
  const {value,bars,width} = invoiceBarcode(invoiceNumber,invoiceId);
  return <div className="invoice-barcode">
    <svg role="img" aria-label={`Barcode for ${value}`} width={width} height="48" viewBox={`0 0 ${width} 48`} style={{width: `${width * 0.3}mm`}} preserveAspectRatio="none">
      <rect width={width} height="48" fill="white"/>
      <g fill="black">{bars.map(bar=><rect key={bar.x} x={bar.x} width={bar.width} height="48"/>)}</g>
    </svg>
    {value !== invoiceNumber && <small>{value}</small>}
  </div>;
}