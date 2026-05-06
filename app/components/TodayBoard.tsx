'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MedicationWithStatus, Slot } from '@/lib/types';
import { SLOT_ORDER, SLOT_LABEL } from '@/lib/medications';
import SlotBlock, { type CarryOverItem } from './SlotBlock';

interface SlotBucket {
  slot: Slot;
  meds: MedicationWithStatus[];
  position: 'past' | 'current' | 'future';
}

interface Props {
  date: string;
  buckets: SlotBucket[];
  carryOver: CarryOverItem[];
  showCompensationBanner?: boolean;
  isCompensationDay?: boolean;
}

const SLOT_PAST_LABEL: Record<Slot, string> = {
  ochtend: 'vanochtend',
  middag: 'vanmiddag',
  avond: 'vanavond',
};

export default function TodayBoard({
  date,
  buckets,
  carryOver,
  showCompensationBanner = false,
  isCompensationDay = false,
}: Props) {
  const router = useRouter();
  const [expandTriggers, setExpandTriggers] = useState<Record<Slot, number>>({
    ochtend: 0,
    middag: 0,
    avond: 0,
  });
  const dismissKey = `compensation_dismissed_${date}`;
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(dismissKey)) setDismissed(true);
  }, [dismissKey]);

  function expandPastSlot(slot: Slot) {
    setExpandTriggers((prev) => ({ ...prev, [slot]: prev[slot] + 1 }));
  }

  async function applyCompensation() {
    if (applying) return;
    setApplying(true);
    try {
      const res = await fetch('/api/compensation-day', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, reason: 'avond_gemist' }),
      });
      if (res.ok) router.refresh();
    } finally {
      setApplying(false);
    }
  }

  function dismissBanner() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(dismissKey, '1');
    }
    setDismissed(true);
  }

  const showBanner = showCompensationBanner && !isCompensationDay && !dismissed;

  const past = buckets.filter((b) => b.position === 'past' && b.meds.length > 0);
  const current = buckets.find((b) => b.position === 'current' && b.meds.length > 0);
  const orderedPast = SLOT_ORDER
    .map((s) => past.find((b) => b.slot === s))
    .filter((b): b is SlotBucket => Boolean(b));

  return (
    <div className="space-y-3">
      {showBanner && (
        <div className="rounded-2xl bg-amber-50 border border-amber-300 p-4 text-amber-900 shadow-sm animate-slide-up">
          <p className="font-semibold leading-snug">
            ⚠️ Je hebt gisteravond je antidepressiva gemist
          </p>
          <p className="text-sm mt-1 opacity-90">
            Vandaag verspreid over ochtend, middag en avond (1× per moment).
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={applyCompensation}
              disabled={applying}
              className="flex-1 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold py-2 px-3 rounded-xl shadow disabled:opacity-50 text-sm"
            >
              {applying ? 'Bezig…' : 'Ja, pas aan'}
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              disabled={applying}
              className="flex-1 bg-white text-amber-900 border border-amber-300 hover:bg-amber-100 font-semibold py-2 px-3 rounded-xl text-sm"
            >
              Nee, gewoon normaal
            </button>
          </div>
        </div>
      )}

      {isCompensationDay && (
        <div className="rounded-2xl bg-amber-100/80 border border-amber-300 px-4 py-2 text-amber-900 text-sm">
          🩹 Compensatiedag actief — antidepressiva 1× per moment.
        </div>
      )}

      {orderedPast.map((b) => (
        <SlotBlock
          key={`past-${b.slot}`}
          slot={b.slot}
          meds={b.meds}
          date={date}
          isCurrentSlot={false}
          expandRequestKey={expandTriggers[b.slot]}
        />
      ))}

      {carryOver.length > 0 && current && (
        <button
          type="button"
          onClick={() => expandPastSlot(carryOver[0].fromSlot)}
          className="w-full text-left rounded-2xl bg-amber-50 border border-amber-300 px-3 py-2 text-amber-900 hover:bg-amber-100 transition-colors"
          aria-label="Open het slot waar deze medicatie hoort"
        >
          <p className="text-sm font-semibold leading-snug">
            ⚠️{' '}
            {carryOver
              .map((c) => `${c.name} van ${SLOT_PAST_LABEL[c.fromSlot]}`)
              .join(', ')}{' '}
            nog niet genomen
          </p>
          <p className="text-xs mt-1 opacity-80">
            Luna beslist zelf of ze dit alsnog pakt — dit is geen automatische log. Tik om te openen.
          </p>
        </button>
      )}

      {current && (
        <SlotBlock
          key={`current-${current.slot}`}
          slot={current.slot}
          meds={current.meds}
          date={date}
          isCurrentSlot={true}
        />
      )}

      {!current && orderedPast.length > 0 && (
        <div className="bg-white/95 backdrop-blur rounded-2xl shadow-md p-5 text-center text-slate-700">
          <p className="text-sm">
            Geen {nextSlotLabel(orderedPast)}-medicatie gepland. ✨
          </p>
        </div>
      )}
    </div>
  );
}

function nextSlotLabel(past: SlotBucket[]): string {
  const lastPast = past[past.length - 1]?.slot;
  if (!lastPast) return '';
  const idx = SLOT_ORDER.indexOf(lastPast);
  const next = SLOT_ORDER[idx + 1];
  return next ? SLOT_LABEL[next].toLowerCase() : 'meer';
}
