import type { LogEntry, Medication, MedicationStatus, MedicationWithStatus } from './types';

const GRACE_MINUTES = 30;
export const TZ = 'Europe/Amsterdam';

export function isEssential(med: Medication): boolean {
  return med.type === 'medicatie';
}

export interface AmsterdamParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const PARTS_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function amsterdamParts(date: Date = new Date()): AmsterdamParts {
  const parts = PARTS_FMT.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hourRaw = parseInt(get('hour'), 10);
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: parseInt(get('minute'), 10),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

export function todayISO(date: Date = new Date()): string {
  const { year, month, day } = amsterdamParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function timeHHMM(date: Date = new Date()): string {
  const { hour, minute } = amsterdamParts(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function minutesSinceMidnight(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function determineStatus(
  med: Medication,
  log: LogEntry | undefined,
  now: Date = new Date(),
): MedicationStatus {
  if (log && log.taken === 1) return 'taken';
  const { hour, minute } = amsterdamParts(now);
  const nowMin = hour * 60 + minute;
  const dueMin = minutesSinceMidnight(med.time);
  if (nowMin > dueMin + GRACE_MINUTES) return 'missed';
  return 'pending';
}

export function attachStatus(
  meds: Medication[],
  logs: LogEntry[],
  now: Date = new Date(),
): MedicationWithStatus[] {
  const logByMedId = new Map<string, LogEntry>();
  for (const log of logs) {
    if (log.taken === 1 && !logByMedId.has(log.medication_id)) {
      logByMedId.set(log.medication_id, log);
    }
  }
  return meds.map((med) => {
    const log = logByMedId.get(med.id);
    return { ...med, log, status: determineStatus(med, log, now) };
  });
}

export function isOverdue(med: Medication, now: Date = new Date(), graceMin = GRACE_MINUTES): boolean {
  const { hour, minute } = amsterdamParts(now);
  const nowMin = hour * 60 + minute;
  const dueMin = minutesSinceMidnight(med.time);
  return nowMin > dueMin + graceMin;
}
