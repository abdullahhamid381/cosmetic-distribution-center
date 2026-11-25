'use client';

import {useState} from 'react';
import {Download, MessageCircle, Share2} from 'lucide-react';

export function ShareFieldPdf({kind, id, label, customerPhone}: {kind:'invoice'|'receipt'|'combined'; id:string; label?:string; customerPhone?:string|null}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const href = '/api/field/pdf/'+kind+'/'+id;
  const phone = customerPhone?.trim().replace(/[\s().-]/g,'') ?? '';
  const recipient = /^03\d{9}$/.test(phone) ? '92'+phone.slice(1)
    : /^3\d{9}$/.test(phone) ? '92'+phone
      : /^(?:\+|00)[1-9]\d{7,14}$/.test(phone) ? phone.replace(/^(?:\+|00)/,'')
        : /^923\d{9}$/.test(phone) ? phone : '';

  async function share() {
    if (file) {
      try {
        await navigator.share({files:[file]});
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setMessage('Download the PDF and attach it in WhatsApp.');
        }
      } finally {
        setFile(null);
      }
      return;
    }
    if (!navigator.share || !navigator.canShare) {
      setMessage('Download the PDF and attach it in WhatsApp.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(href);
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) {
        setMessage('The PDF could not be loaded. Try downloading it.');
        return;
      }
      const filename = response.headers.get('content-disposition')?.match(/filename="([A-Za-z0-9_-]+\.pdf)"/i)?.[1]
        ?? `hh-medics-${kind}-${id}.pdf`;
      const pdf = new File([await response.blob()], filename, {type:'application/pdf'});
      if (navigator.canShare({files:[pdf]})) {
        setFile(pdf);
        if (navigator.userActivation?.isActive) {
          try {
            await navigator.share({files:[pdf]});
            setFile(null);
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              setFile(null);
              return;
            }
          }
        }
        setMessage('PDF ready. Tap Share PDF and choose WhatsApp.');
      } else {
        setMessage('Download the PDF and attach it in WhatsApp.');
      }
    } catch {
      setMessage('The PDF could not be loaded. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <div className="actions">
      <button type="button" className="btn" disabled={busy} onClick={share}>
        <Share2 size={15} aria-hidden="true"/> {busy ? 'Preparing PDF…' : label || (file ? 'Share PDF' : 'Share via WhatsApp')}
      </button>
      <a href={href} className="btn"><Download size={15} aria-hidden="true"/> PDF</a>
      {kind==='receipt' && recipient && <a className="btn" href={`https://wa.me/${recipient}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={15} aria-hidden="true"/> Customer WhatsApp
      </a>}
    </div>
    {message && <small className="muted" role="status">{message}</small>}
  </div>;
}
