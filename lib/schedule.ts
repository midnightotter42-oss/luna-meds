import { MEDICATIONS, getMedicationById, prettifyMedicationId, slotForTime } from './medications';
import {
  getAllCustomSchedule,
  getCompensationDay,
  getWeeklyCountForMed,
  type ScheduleRow,
} from './db';
import { amsterdamParts, todayISO } from './status';
import type { Medication, MedicationType } from './types';

export { slotForTime };

export const WEEKDAY_NAMES = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
export const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

export function jsDayToMonFirst(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function dayOfWeekForDate(date: Date): number {
  return jsDayToMonFirst(amsterdamParts(date).weekday);
}

// Hardcoded — bewust: antidepressiva detectie op id-naam
export function isAntidepressivaId(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.includes('antidepressiva') || lower.includes('antidepressant');
}

function isMedicationType(v: unknown): v is MedicationType {
  return v === 'medicatie' || v === 'supplement';
}

function rowToMedication(row: ScheduleRow): Medication {
  const base = getMedicationById(row.medication_id);
  const type: MedicationType = isMedicationType(row.type)
    ? row.type
    : base?.type ?? 'supplement';
  const weeklyMin = row.weekly_min ?? undefined;
  if (base) {
    return {
      ...base,
      time: row.time,
      slot: slotForTime(row.time),
      notes: row.notes ?? base.notes,
      type,
      weeklyMin: weeklyMin ?? undefined,
    };
  }
  return {
    id: row.medication_id,
    name: prettifyMedicationId(row.medication_id),
    slot: slotForTime(row.time),
    time: row.time,
    notes: row.notes ?? undefined,
    type,
    required: type === 'medicatie',
    weeklyMin: weeklyMin ?? undefined,
  };
}

function mondayOfWeek(date: Date): string {
  const dow = dayOfWeekForDate(date);
  const monday = new Date(date);
  monday.setDate(date.getDate() - dow);
  return todayISO(monday);
}

function buildCompensationMeds(base: Medication): Medication[] {
  const slots: Array<{ id: string; slot: 'ochtend' | 'middag' | 'avond'; time: string }> = [
    { id: `${base.id}-ochtend`, slot: 'ochtend', time: '08:00' },
    { id: `${base.id}-middag`, slot: 'middag', time: '13:00' },
    { id: `${base.id}-avond`, slot: 'avond', time: '21:00' },
  ];
  return slots.map((s) => ({
    ...base,
    id: s.id,
    name: 'Antidepressivum (1×)',
    slot: s.slot,
    time: s.time,
    notes: 'Compensatiedag — verspreid over 3 momenten',
    count: 1,
  }));
}

export async function getMedicationsForDate(date: Date): Promise<Medication[]> {
  const all = await getAllCustomSchedule();
  const dow = dayOfWeekForDate(date);
  let meds: Medication[];

  if (all.length === 0) {
    meds = [...MEDICATIONS];
  } else {
    meds = [];
    for (const row of all) {
      if (row.day_of_week !== dow) continue;
      if (row.enabled !== 1) continue;
      meds.push(rowToMedication(row));
    }
  }

  const isoDate = todayISO(date);
  const isCompensationDay = await getCompensationDay(isoDate);

  if (isCompensationDay) {
    const antiBase = meds.find((m) => isAntidepressivaId(m.id));
    if (antiBase) {
      meds = meds.filter((m) => !isAntidepressivaId(m.id));
      meds.push(...buildCompensationMeds(antiBase));
    }
  }

  // Weekly minimum: enrich elke med met weeklyMin met een count
  const weekStart = mondayOfWeek(date);
  const weekEnd = isoDate;
  const enriched: Medication[] = [];
  for (const m of meds) {
    if (m.weeklyMin && m.weeklyMin > 0) {
      const weeklyCount = await getWeeklyCountForMed(m.id, weekStart, weekEnd);
      enriched.push({ ...m, weeklyCount });
    } else {
      enriched.push(m);
    }
  }

  enriched.sort((a, b) => a.time.localeCompare(b.time));
  return enriched;
}

export interface WeekSchedule {
  hasCustom: boolean;
  days: Array<{
    day_of_week: number;
    name: string;
    entries: Array<{
      medication_id: string;
      name: string;
      time: string;
      enabled: boolean;
      notes: string | null;
      type: MedicationType;
      weekly_min: number | null;
    }>;
  }>;
}

export async function getFullWeekSchedule(): Promise<WeekSchedule> {
  const all = await getAllCustomSchedule();
  const hasCustom = all.length > 0;

  const days: WeekSchedule['days'] = [];
  for (let dow = 0; dow < 7; dow++) {
    const rows = all.filter((r) => r.day_of_week === dow);
    let entries: WeekSchedule['days'][number]['entries'];
    if (hasCustom) {
      entries = rows
        .map((r) => {
          const med = rowToMedication(r);
          return {
            medication_id: r.medication_id,
            name: med.name,
            time: r.time,
            enabled: r.enabled === 1,
            notes: r.notes,
            type: med.type,
            weekly_min: r.weekly_min,
          };
        })
        .sort((a, b) => a.time.localeCompare(b.time));
    } else {
      entries = MEDICATIONS.map((m) => ({
        medication_id: m.id,
        name: m.name,
        time: m.time,
        enabled: true,
        notes: m.notes ?? null,
        type: m.type,
        weekly_min: null,
      })).sort((a, b) => a.time.localeCompare(b.time));
    }
    days.push({ day_of_week: dow, name: WEEKDAY_NAMES[dow], entries });
  }

  return { hasCustom, days };
}
