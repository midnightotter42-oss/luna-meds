'use client';

import { useEffect, useState } from 'react';

interface Props {
  vapidPublicKey: string | null;
}

type Support = 'checking' | 'supported' | 'unsupported';
type Status = 'unknown' | 'idle' | 'enabled' | 'denied';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushToggle({ vapidPublicKey }: Props) {
  const [support, setSupport] = useState<Support>('checking');
  const [status, setStatus] = useState<Status>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setSupport('unsupported');
      return;
    }
    setSupport('supported');
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setSub(existing);
        if (existing) {
          setStatus('enabled');
        } else if (Notification.permission === 'denied') {
          setStatus('denied');
        } else {
          setStatus('idle');
        }
      } catch {
        setStatus('idle');
      }
    })();
  }, []);

  async function enable() {
    if (!vapidPublicKey) {
      setError('Server is niet geconfigureerd voor push (NEXT_PUBLIC_VAPID_PUBLIC_KEY ontbreekt).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(vapidPublicKey);
      const newSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer as ArrayBuffer,
      });
      const json = newSub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Inschrijven mislukt');
      }
      setSub(newSub);
      setStatus('enabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inschakelen mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = sub ?? (await reg.pushManager.getSubscription());
      if (existing) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        }).catch(() => undefined);
        await existing.unsubscribe().catch(() => undefined);
      }
      setSub(null);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uitschakelen mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg p-4 mb-5">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Meldingen</h2>
      <p className="text-sm text-slate-600 mb-3">
        Push notificaties op je telefoon, met een &laquo;Genomen ✓&raquo; knop direct in de melding.
      </p>

      {support === 'checking' && (
        <p className="text-sm text-slate-500">Controleren…</p>
      )}

      {support === 'unsupported' && (
        <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
          Push notificaties worden niet ondersteund door je browser. Voeg de app toe aan je
          homescreen op iPhone (Safari → Deel → Zet op beginscherm) en open deze pagina opnieuw.
        </p>
      )}

      {support === 'supported' && (
        <>
          {status === 'enabled' && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">
                Aan ✓
              </span>
              <button
                type="button"
                onClick={disable}
                disabled={busy}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-xl text-sm disabled:opacity-50"
              >
                {busy ? 'Bezig…' : 'Uitschakelen'}
              </button>
            </div>
          )}

          {status === 'idle' && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-bold py-3 rounded-2xl shadow-md disabled:opacity-50"
            >
              {busy ? 'Bezig…' : 'Meldingen inschakelen'}
            </button>
          )}

          {status === 'denied' && (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">
              Meldingen zijn geblokkeerd in de browser. Sta ze handmatig toe in de
              site-instellingen om dit aan te zetten.
            </p>
          )}

          {status === 'unknown' && (
            <p className="text-sm text-slate-500">Status laden…</p>
          )}

          {error && (
            <p className="text-xs text-red-600 mt-2">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
