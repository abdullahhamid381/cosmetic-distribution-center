type InvoiceLineDiscountProps = {
 effective: number;
 first?: number;
 second: number;
};

export function InvoiceLineDiscount({effective,first,second}:InvoiceLineDiscountProps) {
 if(first===undefined||second===0)return <>{effective.toFixed(2)}%</>;
 return <>
  <strong>{effective.toFixed(2)}%</strong>
  <div><small>1st {first.toFixed(2)}%<br/>2nd {second.toFixed(2)}%</small></div>
 </>;
}
