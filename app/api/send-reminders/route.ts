import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { getLogsForDate, hasReminderBeenSent, recordReminderSent } from '@/lib/db';
import { isOverdue, todayISO } from '@/lib/status';
import { getMedicationsForDate } from '@/lib/schedule';
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

async function dayHadAllRequiredTaken(date: string, refDate: Date): Promise<boolean> {
  const meds = await getMedicationsForDate(refDate);
  const required = meds.filter((m) => m.required);
  if (required.length === 0) return true;
  const taken = takenIds(await getLogsForDate(date));
  return required.every((m) => taken.has(m.id));
}

async function consecutiveMissedDays(today: Date): Promise<number> {
  let count = 0;
  for (let i = 1; i <= 14; i++) {
    const d = dateOffset(today, -i);
    const iso = todayISO(d);
    if (await dayHadAllRequiredTaken(iso, d)) break;
    count++;
  }
  return count;
}

function pickTier(missedYesterdayDays: number): ReminderTier {
  if (missedYesterdayDays >= 3) return 'urgent';
  if (missedYesterdayDays >= 2) return 'serious';
  return 'gentle';
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'REMINDER_CRON_SECRET niet ingesteld' },
      { status: 401 },
    );
  }
  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '');
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const todayDate = todayISO(now);
  const meds = await getMedicationsForDate(now);
  const todayLogs = await getLogsForDate(todayDate);
  const taken = takenIds(todayLogs);

  const overdueToday: Medication[] = meds.filter(
    (m) => !taken.has(m.id) && isOverdue(m, now),
  );

  if (overdueToday.length === 0) {
    return NextResponse.json({ sent: false, reason: 'Niets gemist nu — alles op schema 💚' });
  }

  const missedDays = await consecutiveMissedDays(now);
  const tier = pickTier(missedDays);

  if (await hasReminderBeenSent(todayDate, tier)) {
    return NextResponse.json({
      sent: false,
      reason: 'Reminder al verstuurd voor deze dag/tier',
      tier,
    });
  }

  try {
    await sendReminderEmail({
      tier,
      missedToday: overdueToday,
      consecutiveMissedDays: missedDays + 1,
    });
    await recordReminderSent(todayDate, tier);
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
