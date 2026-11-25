'use client';

import {useLayoutEffect, useRef, type ReactNode} from 'react';

export function InvoicePrintSlot({children, footer}: {children: ReactNode; footer: ReactNode}) {
  const slot = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = slot.current;
    const slip = content.current;
    if (!frame || !slip) return;

    function fit() {
      if (!frame || !slip) return;
      const height = frame.clientHeight;
      if (height === 0 || frame.clientWidth === 0) return;
      function fits(scale: number) {
        if (!slip) return false;
        slip.style.setProperty('--slip-scale', String(scale));
        return Math.max(slip.offsetHeight, slip.scrollHeight) * scale <= height - 2
          && slip.scrollWidth <= slip.clientWidth + 1;
      }

      let scale = 1;
      if (!fits(scale)) {
        let lower = 0;
        let upper = 1;
        for (let step = 0; step < 10; step++) {
          const candidate = (lower + upper) / 2;
          if (fits(candidate)) lower = candidate;
          else upper = candidate;
        }
        scale = lower || 1;
      }
      slip.style.setProperty('--slip-scale', String(scale));
      const top = Math.max(0, (height - Math.max(slip.offsetHeight, slip.scrollHeight) * scale) / 2);
      slip.style.setProperty('--slip-top', `${top}px`);
    }

    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(slip);
    const printMedia = window.matchMedia('print');
    printMedia.addEventListener('change', fit);
    window.addEventListener('beforeprint', fit);
    fit();
    return () => {
      observer.disconnect();
      printMedia.removeEventListener('change', fit);
      window.removeEventListener('beforeprint', fit);
    };
  }, []);

  return <div className="invoice-print-slot">
    <div className="invoice-print-slot-body" ref={slot}>
      <div className="invoice-print-slot-content" ref={content}>{children}{footer}</div>
    </div>
  </div>;
}
