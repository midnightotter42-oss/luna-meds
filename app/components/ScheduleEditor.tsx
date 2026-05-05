'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WeekSchedule } from '@/lib/schedule';

interface MedCatalogItem {
  id: string;
  name: string;
  type: string;
  required: boolean;
  defaultTime: string;
  defaultNotes: string | null;
}

interface Entry {
  medication_id: string;
  time: string;
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
  catalog: MedCatalogItem[];
}

const DAY_LABEL_FULL = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

function buildInitialState(schedule: WeekSchedule): DayState[] {
  return schedule.days.map((d) => {
    const entries: Entry[] = d.entries
      .filter((e) => e.enabled)
      .map((e) => ({
        medication_id: e.medication_id,
        time: e.time,
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

export default function ScheduleEditor({ initialSchedule, catalog }: Props) {
  const router = useRouter();
  const [days, setDays] = useState<DayState[]>(() => buildInitialState(initialSchedule));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<number>(0);

  const catalogById = useMemo(() => {
    const m = new Map<string, MedCatalogItem>();
    for (const c of catalog) m.set(c.id, c);
    return m;
  }, [catalog]);

  function updateDay(dow: number, mut: (d: DayState) => DayState) {
    setDays((prev) => prev.map((d) => (d.day_of_week === dow ? mut(d) : d)));
  }

  function toggleDay(dow: number) {
    updateDay(dow, (d) => ({ ...d, enabled: !d.enabled }));
  }

  function addEntry(dow: number) {
    const day = days.find((d) => d.day_of_week === dow);
    if (!day) return;
    const usedIds = new Set(day.entries.map((e) => e.medication_id));
    const next = catalog.find((c) => !usedIds.has(c.id));
    if (!next) {
      setError('Alle medicijnen zijn al toegevoegd voor deze dag.');
      return;
    }
    setError(null);
    updateDay(dow, (d) => ({
      ...d,
      entries: [
        ...d.entries,
        { medication_id: next.id, time: next.defaultTime, notes: next.defaultNotes },
      ],
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
      for (const d of days) {
        if (!d.enabled) continue;
        const seen = new Set<string>();
        for (const e of d.entries) {
          if (seen.has(e.medication_id)) {
            throw new Error(`${d.name}: medicijn mag maar 1x per dag voorkomen.`);
          }
          seen.add(e.medication_id);
          if (!/^\d{2}:\d{2}$/.test(e.time)) {
            throw new Error(`${d.name}: ongeldige tijd voor ${e.medication_id}`);
          }
        }
      }

      const body = {
        days: days.map((d) => ({
          day_of_week: d.day_of_week,
          entries: d.enabled
            ? d.entries.map((e) => ({
                medication_id: e.medication_id,
                time: e.time,
                enabled: true,
                notes: e.notes,
              }))
            : [],
        })),
      };

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
              <div className="px-4 pb-4 space-y-2 border-t border-slate-100 pt-3 animate-slide-up">
                {day.entries.length === 0 && (
                  <p className="text-sm text-slate-500 italic">
                    Nog geen medicijnen — klik &laquo;Toevoegen&raquo;.
                  </p>
                )}
                {day.entries.map((entry, idx) => {
                  const cat = catalogById.get(entry.medication_id);
                  return (
                    <div
                      key={idx}
                      className="bg-slate-50 rounded-xl p-3 flex items-center gap-2"
                    >
                      <select
                        value={entry.medication_id}
                        onChange={(e) => {
                          const newId = e.target.value;
                          const newCat = catalogById.get(newId);
                          changeEntry(day.day_of_week, idx, (cur) => ({
                            ...cur,
                            medication_id: newId,
                            notes: newCat?.defaultNotes ?? cur.notes,
                          }));
                        }}
                        className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-800 text-sm"
                      >
                        {catalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={entry.time}
                        onChange={(e) =>
                          changeEntry(day.day_of_week, idx, (cur) => ({
                            ...cur,
                            time: e.target.value,
                          }))
                        }
                        className="bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-800 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeEntry(day.day_of_week, idx)}
                        aria-label={`Verwijder ${cat?.name ?? entry.medication_id}`}
                        className="w-9 h-9 shrink-0 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addEntry(day.day_of_week)}
                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold py-2 rounded-xl text-sm"
                >
                  + Medicijn toevoegen
                </button>
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
