'use client';

import {useState} from 'react';
import {Download, Share2} from 'lucide-react';

export function ShareFieldPdf({kind, id, label}: {kind:'invoice'|'receipt'|'combined'; id:string; label?:string}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const href = '/api/field/pdf/'+kind+'/'+id;

  async function share() {
    if (file) {
      try {
        await navigator.share({files:[file]});
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setMessage('Download the PDF and attach it in WhatsApp.');
        }
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
      const pdf = new File([await response.blob()], `hh-medics-${kind}-${id}.pdf`, {type:'application/pdf'});
      if (navigator.canShare({files:[pdf]})) {
        setFile(pdf);
        if (navigator.userActivation?.isActive) {
          try {
            await navigator.share({files:[pdf]});
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
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
    </div>
    {message && <small className="muted" role="status">{message}</small>}
  </div>;
}
