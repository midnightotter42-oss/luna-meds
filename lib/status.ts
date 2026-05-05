import type { LogEntry, Medication, MedicationStatus, MedicationWithStatus } from './types';

const GRACE_MINUTES = 30;

export function todayISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function timeHHMM(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
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
  const nowMin = now.getHours() * 60 + now.getMinutes();
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
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dueMin = minutesSinceMidnight(med.time);
  return nowMin > dueMin + graceMin;
}
