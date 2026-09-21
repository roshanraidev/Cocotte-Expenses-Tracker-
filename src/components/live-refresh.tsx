'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
/** Refresh visible data after another user saves, without interrupting form entry. */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && !document.querySelector('input:focus,textarea:focus,select:focus')) router.refresh(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [router]);
  return null;
}
