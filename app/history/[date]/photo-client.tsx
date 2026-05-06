'use client';

import { useState } from 'react';

interface Props {
  logId: number;
  medName: string;
}

export default function HistoryPhoto({ logId, medName }: Props) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/log/${logId}/photo`);
      if (!res.ok) throw new Error('Foto kon niet geladen worden');
      const body = (await res.json()) as { photo?: string };
      if (!body.photo) throw new Error('Geen foto');
      setPhoto(body.photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  if (!photo) {
    return (
      <>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-sm text-luna-accent hover:underline disabled:opacity-50"
        >
          {loading ? 'Laden…' : '📷 Foto bekijken'}
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className="block"
        aria-label={`Vergroot foto van ${medName}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt={`Foto van ${medName}`}
          className="w-full max-w-xs rounded-xl border border-slate-200"
        />
      </button>
      {zoom && (
        <button
          type="button"
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          aria-label="Sluit foto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt={`Foto van ${medName}`}
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
          />
        </button>
      )}
    </>
  );
}
