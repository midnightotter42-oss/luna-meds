'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MedicationWithStatus } from '@/lib/types';

interface Props {
  med: MedicationWithStatus;
  date: string;
}

function playCheckSound() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const tones = [
      { freq: 660, start: 0, dur: 0.12 },
      { freq: 880, start: 0.1, dur: 0.18 },
    ];
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = t.freq;
      gain.gain.setValueAtTime(0.0001, now + t.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + t.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.05);
    }
    setTimeout(() => ctx.close(), 600);
  } catch {
    // audio mag falen
  }
}

export default function ActiveMedCard({ med, date }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justTaken, setJustTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missed = med.status === 'missed';

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('medication_id', med.id);
      fd.append('date', date);
      const res = await fetch('/api/log', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Opslaan mislukt');
      }
      playCheckSound();
      setJustTaken(true);
      setTimeout(() => router.refresh(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis');
    } finally {
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div
      className={`bg-white/95 backdrop-blur rounded-3xl shadow-xl p-7 w-full ${
        justTaken ? 'animate-pulse-success' : 'animate-slide-up'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <span className="text-xs uppercase tracking-wider font-semibold text-blue-500">
          Nu innemen
        </span>
        {missed && (
          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-600 font-semibold">
            Te laat
          </span>
        )}
      </div>

      <h2 className="text-3xl font-bold text-slate-800 leading-tight">{med.name}</h2>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-2xl font-semibold text-slate-700">{med.time}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
          {med.type}
        </span>
        {med.required && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            verplicht
          </span>
        )}
      </div>

      {med.notes && <p className="text-base text-slate-600 mt-3 leading-snug">{med.notes}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPhotoSelected}
        disabled={submitting}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={submitting}
        className="mt-6 w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-xl font-bold py-5 rounded-2xl transition-colors shadow-lg shadow-green-500/30 disabled:opacity-50"
      >
        {submitting ? 'Bezig…' : 'Genomen ✓'}
      </button>
      {error && <p className="text-sm text-red-600 mt-3 text-center">{error}</p>}
    </div>
  );
}
