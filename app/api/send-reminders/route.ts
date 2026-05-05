import { NextResponse } from 'next/server';
import { MEDICATIONS } from '@/lib/medications';
import { getLogsForDate } from '@/lib/db';
import { isOverdue, todayISO } from '@/lib/status';
import { sendReminderEmail, type ReminderTier } from '@/lib/email';
import type { LogEntry, Medication } from '@/lib/types';

export const runtime = 'nodejs';

function takenIds(logs: LogEntry[]): Set<string> {
  const taken = new Set<string>();
  for (const l of logs) if (l.taken === 1) taken.add(l.medication_id);
  return taken;
}

function dateOffset(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + days);
  return x;
}

async function dayHadAllRequiredTaken(date: string): Promise<boolean> {
  const taken = takenIds(await getLogsForDate(date));
  const required = MEDICATIONS.filter((m) => m.required);
  return required.every((m) => taken.has(m.id));
}

async function consecutiveMissedDays(today: Date): Promise<number> {
  let count = 0;
  for (let i = 1; i <= 14; i++) {
    const d = dateOffset(today, -i);
    const iso = todayISO(d);
    if (await dayHadAllRequiredTaken(iso)) break;
    count++;
  }
  return count;
}

function pickTier(missedYesterdayDays: number): ReminderTier {
  if (missedYesterdayDays >= 3) return 'urgent';
  if (missedYesterdayDays >= 2) return 'serious';
  return 'gentle';
}

export async function POST(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    const provided = auth.replace(/^Bearer\s+/i, '');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const todayDate = todayISO(now);
  const todayLogs = await getLogsForDate(todayDate);
  const taken = takenIds(todayLogs);

  const overdueToday: Medication[] = MEDICATIONS.filter(
    (m) => !taken.has(m.id) && isOverdue(m, now),
  );

  if (overdueToday.length === 0) {
    return NextResponse.json({ sent: false, reason: 'Niets gemist nu — alles op schema 💚' });
  }

  const missedDays = await consecutiveMissedDays(now);
  const tier = pickTier(missedDays);

  try {
    await sendReminderEmail({
      tier,
      missedToday: overdueToday,
      consecutiveMissedDays: missedDays + 1,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Mail verzenden mislukt' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sent: true,
    tier,
    missed: overdueToday.map((m) => m.id),
    consecutiveMissedDays: missedDays,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
