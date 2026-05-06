'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WeekSchedule } from '@/lib/schedule';
import {
  SLOT_DEFAULT_TIME,
  SLOT_LABEL,
  SLOT_ORDER,
  nameToMedicationId,
  slotForTime,
} from '@/lib/medications';
import type { MedicationType, Slot } from '@/lib/types';

interface Entry {
  name: string;
  slot: Slot;
  type: MedicationType;
  notes: string | null;
}

interface DayState {
  day_of_week: number;
  name: string;
  enabled: boolean;
  entries: Entry[];
}

interface Props {
  initialSchedule: WeekSchedule;
}

const DAY_LABEL_FULL = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

function buildInitialState(schedule: WeekSchedule): DayState[] {
  return schedule.days.map((d) => {
    const entries: Entry[] = d.entries
      .filter((e) => e.enabled)
      .map((e) => ({
        name: e.name,
        slot: slotForTime(e.time),
        type: e.type,
        notes: e.notes,
      }));
    return {
      day_of_week: d.day_of_week,
      name: d.name,
      enabled: entries.length > 0 || !schedule.hasCustom,
      entries,
    };
  });
}

export default function ScheduleEditor({ initialSchedule }: Props) {
  const router = useRouter();
  const [days, setDays] = useState<DayState[]>(() => buildInitialState(initialSchedule));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<number>(0);

  function updateDay(dow: number, mut: (d: DayState) => DayState) {
    setDays((prev) => prev.map((d) => (d.day_of_week === dow ? mut(d) : d)));
  }

  function toggleDay(dow: number) {
    updateDay(dow, (d) => ({ ...d, enabled: !d.enabled }));
  }

  function addEntry(dow: number, type: MedicationType) {
    setError(null);
    updateDay(dow, (d) => ({
      ...d,
      entries: [...d.entries, { name: '', slot: 'ochtend', type, notes: null }],
    }));
  }

  function removeEntry(dow: number, idx: number) {
    updateDay(dow, (d) => ({ ...d, entries: d.entries.filter((_, i) => i !== idx) }));
  }

  function changeEntry(dow: number, idx: number, mut: (e: Entry) => Entry) {
    updateDay(dow, (d) => ({
      ...d,
      entries: d.entries.map((e, i) => (i === idx ? mut(e) : e)),
    }));
  }

  function copyMondayToAll() {
    const monday = days.find((d) => d.day_of_week === 0);
    if (!monday) return;
    setDays((prev) =>
      prev.map((d) =>
        d.day_of_week === 0
          ? d
          : {
              ...d,
              enabled: monday.enabled,
              entries: monday.entries.map((e) => ({ ...e })),
            },
      ),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const dayPayloads: Array<{
        day_of_week: number;
        entries: Array<{
          medication_id: string;
          time: string;
          enabled: true;
          notes: string | null;
          type: MedicationType;
        }>;
      }> = [];

      for (const d of days) {
        const entries = d.enabled
          ? d.entries.map((e) => {
              const trimmed = e.name.trim();
              if (!trimmed) {
                throw new Error(`${d.name}: vul een naam in voor elk medicijn.`);
              }
              const slug = nameToMedicationId(trimmed);
              if (!slug) {
                throw new Error(`${d.name}: ongeldige naam "${trimmed}".`);
              }
              return {
                medication_id: slug,
                time: SLOT_DEFAULT_TIME[e.slot],
                enabled: true as const,
                notes: e.notes,
                type: e.type,
              };
            })
          : [];

        const seen = new Set<string>();
        for (const e of entries) {
          if (seen.has(e.medication_id)) {
            throw new Error(`${d.name}: ${e.medication_id} mag maar 1x per dag voorkomen.`);
          }
          seen.add(e.medication_id);
        }

        dayPayloads.push({ day_of_week: d.day_of_week, entries });
      }

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: dayPayloads }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Opslaan mislukt');
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={copyMondayToAll}
        className="w-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-sm py-2 px-4 rounded-xl border border-white/20 transition-colors"
      >
        Kopieer maandag naar alle dagen
      </button>

      {days.map((day) => {
        const isOpen = openDay === day.day_of_week;
        return (
          <div
            key={day.day_of_week}
            className="bg-white/95 backdrop-blur rounded-2xl shadow-lg overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <button
                type="button"
                onClick={() => setOpenDay(isOpen ? -1 : day.day_of_week)}
                className="flex-1 text-left flex items-center gap-2"
              >
                <span className="font-semibold text-slate-800">
                  {DAY_LABEL_FULL[day.day_of_week]}
                </span>
                <span className="text-xs text-slate-500">
                  {day.enabled ? `${day.entries.length} medicijn${day.entries.length === 1 ? '' : 'en'}` : 'vrij'}
                </span>
                <span
                  className={`ml-auto text-slate-400 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                >
                  ▾
                </span>
              </button>
              <label className="flex items-center gap-2 select-none">
                <span className="text-xs text-slate-500">{day.enabled ? 'aan' : 'uit'}</span>
                <input
                  type="checkbox"
                  checked={day.enabled}
                  onChange={() => toggleDay(day.day_of_week)}
                  className="w-5 h-5 accent-blue-500"
                  aria-label={`Dag ${DAY_LABEL_FULL[day.day_of_week]} ${day.enabled ? 'uit' : 'aan'}zetten`}
                />
              </label>
            </div>

            {isOpen && day.enabled && (
              <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3 animate-slide-up">
                {(['medicatie', 'supplement'] as MedicationType[]).map((kind) => {
                  const sectionEntries = day.entries
                    .map((e, idx) => ({ e, idx }))
                    .filter(({ e }) => e.type === kind);
                  const heading =
                    kind === 'medicatie' ? 'Medicatie (essentieel)' : 'Supplementen';
                  const addLabel =
                    kind === 'medicatie' ? '+ Medicijn toevoegen' : '+ Supplement toevoegen';
                  const accent =
                    kind === 'medicatie'
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-700';
                  const badgeClass =
                    kind === 'medicatie'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-blue-100 text-blue-700';
                  const badgeLabel = kind === 'medicatie' ? 'essentieel' : 'supplement';
                  const namePlaceholder =
                    kind === 'medicatie'
                      ? 'Naam medicijn (bv. Levothyroxine)'
                      : 'Naam supplement (bv. Vitamine D)';

                  return (
                    <div key={kind} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {heading}
                        </h3>
                        <span className="text-xs text-slate-400">{sectionEntries.length}</span>
                      </div>
                      {sectionEntries.length === 0 && (
                        <p className="text-sm text-slate-400 italic">
                          {kind === 'medicatie'
                            ? 'Nog geen essentiële medicatie ingepland.'
                            : 'Nog geen supplementen ingepland.'}
                        </p>
                      )}
                      {sectionEntries.map(({ e: entry, idx }) => (
                        <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <input
                                type="text"
                                value={entry.name}
                                onChange={(ev) =>
                                  changeEntry(day.day_of_week, idx, (cur) => ({
                                    ...cur,
                                    name: ev.target.value,
                                  }))
                                }
                                placeholder={namePlaceholder}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-800 text-sm"
                              />
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full self-start ${badgeClass}`}
                              >
                                {badgeLabel}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeEntry(day.day_of_week, idx)}
                              aria-label={`Verwijder ${entry.name || 'medicijn'}`}
                              className="w-9 h-9 shrink-0 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="flex gap-2">
                            {SLOT_ORDER.map((slot) => {
                              const active = entry.slot === slot;
                              return (
                                <button
                                  key={slot}
                                  type="button"
                                  onClick={() =>
                                    changeEntry(day.day_of_week, idx, (cur) => ({
                                      ...cur,
                                      slot,
                                    }))
                                  }
                                  aria-pressed={active}
                                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                                    active
                                      ? 'bg-blue-500 text-white border-blue-500 shadow'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {SLOT_LABEL[slot]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addEntry(day.day_of_week, kind)}
                        className={`w-full font-semibold py-2 rounded-xl text-sm ${accent}`}
                      >
                        {addLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {isOpen && !day.enabled && (
              <div className="px-4 pb-4 text-sm text-slate-500 italic border-t border-slate-100 pt-3">
                Deze dag is uitgezet — geen medicijnen.
              </div>
            )}
          </div>
        );
      })}

      <div className="sticky bottom-0 -mx-5 px-5 pt-4 pb-6 bg-gradient-to-t from-blue-600 via-blue-600/95 to-transparent">
        {error && (
          <p className="text-sm bg-red-50 text-red-700 rounded-lg px-3 py-2 mb-2">{error}</p>
        )}
        {savedAt && !error && (
          <p className="text-sm bg-green-50 text-green-700 rounded-lg px-3 py-2 mb-2">
            Opgeslagen ✓
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-lg font-bold py-4 rounded-2xl shadow-lg shadow-green-500/30 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>
    </div>
  );
}
