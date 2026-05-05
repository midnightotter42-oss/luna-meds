'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MedicationWithStatus, Slot } from '@/lib/types';
import { SLOT_EMOJI, SLOT_LABEL } from '@/lib/medications';

export type SlotVariant = 'active' | 'past-complete' | 'past-incomplete' | 'future';

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

interface MedRowProps {
  med: MedicationWithStatus;
  date: string;
  emphasize: boolean;
}

function MedRow({ med, date, emphasize }: MedRowProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justTaken, setJustTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taken = med.status === 'taken' || justTaken;
  const missed = !taken && med.status === 'missed';

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

  const rowBg = taken
    ? 'bg-green-50 border-green-200'
    : emphasize
    ? 'bg-white border-slate-200'
    : 'bg-white/70 border-slate-200';

  return (
    <div className={`rounded-2xl border p-3 ${rowBg} ${justTaken ? 'animate-pulse-success' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800 leading-tight">{med.name}</h3>
            <span className="text-sm font-medium text-slate-500">{med.time}</span>
            {missed && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
                Te laat
              </span>
            )}
            {med.required && !taken && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                verplicht
              </span>
            )}
          </div>
          {med.notes && !taken && (
            <p className="text-xs text-slate-500 mt-1 leading-snug">{med.notes}</p>
          )}
          {taken && med.log?.time_taken && (
            <p className="text-xs text-green-700 mt-1 font-medium">
              Genomen om {med.log.time_taken}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {taken ? (
            <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center text-xl font-bold">
              ✓
            </div>
          ) : (
            <>
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
                className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm shadow shadow-green-500/30 disabled:opacity-50 whitespace-nowrap"
              >
                {submitting ? 'Bezig…' : 'Genomen ✓'}
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

interface SlotBlockProps {
  slot: Slot;
  meds: MedicationWithStatus[];
  date: string;
  variant: SlotVariant;
}

export default function SlotBlock({ slot, meds, date, variant }: SlotBlockProps) {
  const isActive = variant === 'active';
  const taken = meds.filter((m) => m.status === 'taken').length;
  const total = meds.length;

  const containerClass =
    variant === 'active'
      ? 'bg-white/95 backdrop-blur shadow-xl ring-2 ring-white/60 animate-slide-up'
      : variant === 'past-complete'
      ? 'bg-green-100/85 backdrop-blur shadow-md'
      : variant === 'past-incomplete'
      ? 'bg-slate-200/75 backdrop-blur shadow-md'
      : 'bg-white/40 backdrop-blur shadow-md';

  const labelTextClass = isActive ? 'text-slate-800' : 'text-slate-700';
  const counterClass =
    variant === 'past-complete'
      ? 'text-green-700'
      : variant === 'active'
      ? 'text-blue-600'
      : 'text-slate-600';

  return (
    <div className={`rounded-3xl p-5 w-full ${containerClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {SLOT_EMOJI[slot]}
          </span>
          <h2 className={`text-xl font-bold ${labelTextClass}`}>{SLOT_LABEL[slot]}</h2>
          {isActive && (
            <span className="text-xs uppercase tracking-wider font-semibold text-blue-500 ml-1">
              nu
            </span>
          )}
        </div>
        <span className={`text-sm font-semibold ${counterClass}`}>
          {taken}/{total}
        </span>
      </div>
      <div className="space-y-2">
        {meds.map((m) => (
          <MedRow key={m.id} med={m} date={date} emphasize={isActive} />
        ))}
      </div>
    </div>
  );
}
