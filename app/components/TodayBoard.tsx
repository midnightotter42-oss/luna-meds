'use client';

import { useState } from 'react';
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
}

const SLOT_PAST_LABEL: Record<Slot, string> = {
  ochtend: 'vanochtend',
  middag: 'vanmiddag',
  avond: 'vanavond',
};

export default function TodayBoard({ date, buckets, carryOver }: Props) {
  const [expandTriggers, setExpandTriggers] = useState<Record<Slot, number>>({
    ochtend: 0,
    middag: 0,
    avond: 0,
  });

  function expandPastSlot(slot: Slot) {
    setExpandTriggers((prev) => ({ ...prev, [slot]: prev[slot] + 1 }));
  }

  const past = buckets.filter((b) => b.position === 'past' && b.meds.length > 0);
  const current = buckets.find((b) => b.position === 'current' && b.meds.length > 0);
  const orderedPast = SLOT_ORDER
    .map((s) => past.find((b) => b.slot === s))
    .filter((b): b is SlotBucket => Boolean(b));

  return (
    <div className="space-y-3">
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
