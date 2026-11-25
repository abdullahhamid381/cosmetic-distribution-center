'use client';

import {useEffect, useRef, useState, useTransition} from 'react';
import {usePathname, useRouter} from 'next/navigation';

const refreshEvery = 30_000;
const summaryPages = new Set(['/dashboard', '/operations', '/agent', '/agent/commissions', '/sales-team', '/reports', '/balance']);

export function WorkspaceLiveRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const lastRefresh = useRef(0);

  useEffect(() => {
    const updateStatus = () => setOffline(!navigator.onLine);
    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  useEffect(() => {
    if (!summaryPages.has(pathname) || refreshing) return;
    function refresh(minimumAge: number) {
      const focus = document.activeElement;
      if (!navigator.onLine || document.visibilityState !== 'visible' || Date.now() - lastRefresh.current < minimumAge) return;
      if (focus?.closest('input, textarea, select, [contenteditable], dialog')) return;
      lastRefresh.current = Date.now();
      startRefresh(() => router.refresh());
    }

    const onResume = () => refresh(5000);
    const timer = window.setInterval(() => refresh(refreshEvery), refreshEvery);
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
    };
  }, [pathname, refreshing, router]);

  return offline ? <p className="workspace-offline no-print" role="status">You’re offline. Connect to the internet to load current records or save changes.</p> : null;
}
