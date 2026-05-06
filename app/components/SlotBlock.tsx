'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MedicationWithStatus, Slot } from '@/lib/types';
import { SLOT_EMOJI, SLOT_LABEL } from '@/lib/medications';

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
  emphasize: boolean;
  flash: boolean;
}

function MedRow({ med, emphasize, flash }: MedRowProps) {
  const taken = med.status === 'taken';
  const missed = !taken && med.status === 'missed';
  const essential = med.type === 'medicatie';

  const rowBg = taken
    ? 'bg-green-50 border-green-200'
    : emphasize
    ? 'bg-white border-slate-200'
    : 'bg-white/70 border-slate-200';

  return (
    <div className={`rounded-2xl border p-3 ${rowBg} ${flash ? 'animate-pulse-success' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800 leading-tight">{med.name}</h3>
            <span className="text-sm font-medium text-slate-500">{med.time}</span>
            {essential ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold uppercase tracking-wide">
                essentieel
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold uppercase tracking-wide">
                supplement
              </span>
            )}
            {missed && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
                Te laat
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
        {taken && (
          <div className="shrink-0 w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center text-lg font-bold">
            ✓
          </div>
        )}
      </div>
    </div>
  );
}

export interface CarryOverItem {
  medicationId: string;
  name: string;
  fromSlot: Slot;
}

interface SlotBlockProps {
  slot: Slot;
  meds: MedicationWithStatus[];
  date: string;
  isCurrentSlot: boolean;
  expandRequestKey?: number;
}

export default function SlotBlock({
  slot,
  meds,
  date,
  isCurrentSlot,
  expandRequestKey,
}: SlotBlockProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justTaken, setJustTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taken = meds.filter((m) => m.status === 'taken').length;
  const total = meds.length;
  const allTaken = total > 0 && taken === total;
  const pendingIds = meds.filter((m) => m.status !== 'taken').map((m) => m.id);

  const missedEssentials = meds.filter(
    (m) => m.status !== 'taken' && m.type === 'medicatie',
  );
  const missedSupplements = meds.filter(
    (m) => m.status !== 'taken' && m.type === 'supplement',
  );

  // Past slot: collapsed when alles genomen, uitgeklapt als er iets mist zodat Luna het ziet.
  const [expanded, setExpanded] = useState<boolean>(() => isCurrentSlot || !allTaken);

  useEffect(() => {
    if (isCurrentSlot) return;
    if (expandRequestKey === undefined) return;
    setExpanded(true);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [expandRequestKey, isCurrentSlot]);

  async function submitTaken(file?: File) {
    if (pendingIds.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const id of pendingIds) fd.append('medication_ids', id);
      fd.append('date', date);
      if (file) fd.append('photo', file);

      const res = await fetch('/api/log', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Opslaan mislukt');
      }
      playCheckSound();
      setJustTaken(true);
      setTimeout(() => router.refresh(), 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis');
    } finally {
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await submitTaken(file);
  }

  // Compact past-slot summary (collapsed)
  if (!isCurrentSlot && !expanded) {
    let bg: string;
    let icon: string;
    let title: string;
    let subtitle: string | null = null;

    if (allTaken) {
      bg = 'bg-green-100/85 text-green-800 border border-green-200';
      icon = '✓';
      title = `${SLOT_LABEL[slot]} compleet`;
    } else if (missedEssentials.length > 0) {
      bg = 'bg-amber-100/90 text-amber-900 border border-amber-300';
      icon = '⚠️';
      const names = missedEssentials.map((m) => m.name).join(', ');
      title = `${SLOT_LABEL[slot]} — ${names} niet genomen`;
      subtitle = 'Overleg met je arts of je dit vandaag nog kunt nemen.';
    } else if (missedSupplements.length > 0) {
      bg = 'bg-orange-100/85 text-orange-900 border border-orange-200';
      icon = '○';
      const count = missedSupplements.length;
      title = `${SLOT_LABEL[slot]} — ${count} supplement${count === 1 ? '' : 'en'} gemist`;
    } else {
      bg = 'bg-white/40 text-slate-700 border border-white/40';
      icon = '·';
      title = SLOT_LABEL[slot];
    }

    return (
      <button
        ref={(el) => {
          sectionRef.current = el;
        }}
        type="button"
        onClick={() => setExpanded(true)}
        className={`w-full text-left rounded-2xl px-4 py-3 backdrop-blur shadow-sm transition-all hover:shadow-md ${bg}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg shrink-0" aria-hidden>
            {icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">{title}</p>
            {subtitle && <p className="text-xs mt-0.5 opacity-80">{subtitle}</p>}
          </div>
          <span className="text-xs font-semibold opacity-70 shrink-0">
            {taken}/{total}
          </span>
          <span className="text-slate-500 shrink-0" aria-hidden>
            ▾
          </span>
        </div>
      </button>
    );
  }

  // Expanded view (active or past-expanded)
  const containerClass = isCurrentSlot
    ? 'bg-white/95 backdrop-blur shadow-xl ring-2 ring-white/60 animate-slide-up'
    : allTaken
    ? 'bg-green-100/85 backdrop-blur shadow-md animate-slide-up'
    : missedEssentials.length > 0
    ? 'bg-amber-50/95 backdrop-blur shadow-md animate-slide-up'
    : 'bg-white/85 backdrop-blur shadow-md animate-slide-up';

  const labelTextClass = 'text-slate-800';
  const counterClass = allTaken
    ? 'text-green-700'
    : isCurrentSlot
    ? 'text-blue-600'
    : 'text-slate-600';

  return (
    <div
      ref={(el) => {
        sectionRef.current = el;
      }}
      className={`rounded-3xl p-5 w-full ${containerClass}`}
    >
      {!isCurrentSlot && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-500 hover:text-slate-700 mb-2"
        >
          ▴ inklappen
        </button>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {SLOT_EMOJI[slot]}
          </span>
          <h2 className={`text-xl font-bold ${labelTextClass}`}>{SLOT_LABEL[slot]}</h2>
          {isCurrentSlot && !allTaken && (
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
          <MedRow
            key={m.id}
            med={m}
            emphasize={isCurrentSlot}
            flash={justTaken && m.status !== 'taken'}
          />
        ))}
      </div>

      {!allTaken && (
        <div className="mt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submitTaken()}
              disabled={submitting}
              className="flex-1 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-bold py-3 px-4 rounded-2xl shadow shadow-green-500/30 disabled:opacity-50"
            >
              {submitting ? 'Bezig…' : 'Genomen ✓'}
            </button>
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
              aria-label="Maak een bewijsfoto"
              title="Foto als bewijs"
              className="bg-white hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-2xl shadow border border-slate-200 disabled:opacity-50 text-xl leading-none"
            >
              📷
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
