'use client';

import {useState} from 'react';
import {Plus, Trash2} from 'lucide-react';

export function FieldBookingLines({products}: {products: {id:string; label:string}[]}) {
  const [rows, setRows] = useState([1]);
  const [next, setNext] = useState(2);
  return <div className="field span-2">
    {rows.map((row, index) => (
      <div className="inline-form" key={row}>
        <label className="field">Product {index + 1}
          <select name="product_id" defaultValue="" required>
            <option value="" disabled>Choose product</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.label}</option>)}
          </select>
        </label>
        <label className="field">Quantity
          <input name="quantity" type="number" min="1" max="1000000" step="1" defaultValue="1" required/>
        </label>
        {rows.length > 1 && <button className="btn warn" type="button" aria-label={'Remove product '+(index+1)}
          onClick={() => setRows(rows.filter(id => id !== row))}><Trash2 size={16}/></button>}
      </div>
    ))}
    <button type="button" className="btn" disabled={rows.length >= Math.min(30, products.length)}
      onClick={() => {setRows([...rows,next]);setNext(next+1);}}><Plus size={16}/> Add product</button>
  </div>;
}
