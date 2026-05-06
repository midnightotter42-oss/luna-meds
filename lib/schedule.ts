import { MEDICATIONS, getMedicationById, prettifyMedicationId, slotForTime } from './medications';
import { getAllCustomSchedule, type ScheduleRow } from './db';
import { amsterdamParts } from './status';
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

function isMedicationType(v: unknown): v is MedicationType {
  return v === 'medicatie' || v === 'supplement';
}

function rowToMedication(row: ScheduleRow): Medication {
  const base = getMedicationById(row.medication_id);
  const type: MedicationType = isMedicationType(row.type)
    ? row.type
    : base?.type ?? 'supplement';
  if (base) {
    return {
      ...base,
      time: row.time,
      slot: slotForTime(row.time),
      notes: row.notes ?? base.notes,
      type,
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
  };
}

export async function getMedicationsForDate(date: Date): Promise<Medication[]> {
  const all = await getAllCustomSchedule();
  if (all.length === 0) {
    return [...MEDICATIONS].sort((a, b) => a.time.localeCompare(b.time));
  }
  const dow = dayOfWeekForDate(date);
  const meds: Medication[] = [];
  for (const row of all) {
    if (row.day_of_week !== dow) continue;
    if (row.enabled !== 1) continue;
    meds.push(rowToMedication(row));
  }
  meds.sort((a, b) => a.time.localeCompare(b.time));
  return meds;
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
      })).sort((a, b) => a.time.localeCompare(b.time));
    }
    days.push({ day_of_week: dow, name: WEEKDAY_NAMES[dow], entries });
  }

  return { hasCustom, days };
}
