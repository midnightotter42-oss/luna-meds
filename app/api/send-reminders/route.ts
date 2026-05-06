import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import {
  getLogsForDate,
  hasReminderBeenSent,
  recordReminderSent,
} from '@/lib/db';
import { amsterdamParts, isEssential, isOverdue, todayISO } from '@/lib/status';
import { getMedicationsForDate } from '@/lib/schedule';
import { sendReminderEmail, type ReminderTier } from '@/lib/email';
import { sendBracketPush, type SendBracketPushResult } from '@/lib/push';
import type { LogEntry, Medication, Slot } from '@/lib/types';

export const runtime = 'nodejs';

type TriggerType =
  | 'morning_motivation'
  | 'morning_nudge'
  | 'morning_followup'
  | 'afternoon_nudge'
  | 'afternoon_followup'
  | 'evening_nudge';

interface BracketTrigger {
  bracket: 'ochtend' | 'middag' | 'avond';
  slot: Slot;
  triggerType: TriggerType;
  fireAtMinutes: number;
  title: string;
  body: string;
}

const TRIGGERS: BracketTrigger[] = [
  {
    bracket: 'ochtend',
    slot: 'ochtend',
    triggerType: 'morning_nudge',
    fireAtMinutes: 10 * 60 + 45,
    title: 'Luna app 🌸',
    body: 'Hey Luna 🌸 — je ochtendmedicatie nog niet genomen. Neem ze even voor de middag 💙',
  },
  {
    bracket: 'ochtend',
    slot: 'ochtend',
    triggerType: 'morning_followup',
    fireAtMinutes: 18 * 60,
    title: 'Luna app 💛',
    body: 'Hey, je medicatie van vanochtend is er nog. Gaat het? Probeer het nog even vandaag 💛',
  },
  {
    bracket: 'middag',
    slot: 'middag',
    triggerType: 'afternoon_nudge',
    fireAtMinutes: 15 * 60 + 45,
    title: 'Luna app 🌿',
    body: 'Luna, je middagmedicatie nog niet gedaan 🌿 Nog even snel pakken!',
  },
  {
    bracket: 'middag',
    slot: 'middag',
    triggerType: 'afternoon_followup',
    fireAtMinutes: 20 * 60,
    title: 'Luna app 💙',
    body: 'Je middagmedicatie van vandaag is er nog — probeer ze nog even 💙',
  },
  {
    bracket: 'avond',
    slot: 'avond',
    triggerType: 'evening_nudge',
    fireAtMinutes: 21 * 60 + 15,
    title: 'Luna app 🌙',
    body: 'Luna 🌙 — je avondmedicatie staat klaar. Even pakken voor het slapen 💙',
  },
];

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

async function dayHadAllEssentialTaken(date: string, refDate: Date): Promise<boolean> {
  const meds = await getMedicationsForDate(refDate);
  const essential = meds.filter(isEssential);
  if (essential.length === 0) return true;
  const taken = takenIds(await getLogsForDate(date));
  return essential.every((m) => taken.has(m.id));
}

async function consecutiveMissedDays(today: Date): Promise<number> {
  let count = 0;
  for (let i = 1; i <= 14; i++) {
    const d = dateOffset(today, -i);
    const iso = todayISO(d);
    if (await dayHadAllEssentialTaken(iso, d)) break;
    count++;
  }
  return count;
}

function pickEmailTier(missedYesterdayDays: number): ReminderTier | null {
  if (missedYesterdayDays >= 3) return 'serious';
  if (missedYesterdayDays >= 2) return 'gentle';
  return null;
}

function slotIncomplete(slot: Slot, meds: Medication[], taken: Set<string>): boolean {
  const slotMeds = meds.filter((m) => m.slot === slot);
  if (slotMeds.length === 0) return false;
  const essential = slotMeds.filter(isEssential);
  if (essential.length > 0) {
    return essential.some((m) => !taken.has(m.id));
  }
  return slotMeds.some((m) => !taken.has(m.id));
}

function inQuietHours(hour: number): boolean {
  return hour >= 22 || hour < 7;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface PushAttempt {
  trigger: TriggerType;
  bracket: string;
  result: SendBracketPushResult;
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
  const { hour, minute } = amsterdamParts(now);
  const nowMinutes = hour * 60 + minute;

  const meds = await getMedicationsForDate(now);
  const todayLogs = await getLogsForDate(todayDate);
  const taken = takenIds(todayLogs);

  const pushAttempts: PushAttempt[] = [];

  if (hour === 8) {
    const result = await sendBracketPush({
      date: todayDate,
      bracket: 'ochtend',
      triggerType: 'morning_motivation',
      payload: {
        title: 'Goedemorgen Luna 🌸',
        body: 'Vandaag je medicatie innemen — je hormonen in balans, jij op je best 💙',
        tag: 'ochtend-morning_motivation',
        url: '/',
        bracket: 'ochtend',
      },
    });
    pushAttempts.push({ trigger: 'morning_motivation', bracket: 'ochtend', result });
  }

  if (!inQuietHours(hour)) {
    for (const t of TRIGGERS) {
      if (nowMinutes < t.fireAtMinutes) continue;
      if (!slotIncomplete(t.slot, meds, taken)) continue;
      const result = await sendBracketPush({
        date: todayDate,
        bracket: t.bracket,
        triggerType: t.triggerType,
        payload: {
          title: t.title,
          body: t.body,
          tag: `${t.bracket}-${t.triggerType}`,
          url: '/',
          bracket: t.bracket,
        },
      });
      pushAttempts.push({ trigger: t.triggerType, bracket: t.bracket, result });
    }
  }

  const overdueToday: Medication[] = meds.filter(
    (m) => isEssential(m) && !taken.has(m.id) && isOverdue(m, now),
  );

  let emailResult: { sent: boolean; tier?: ReminderTier; reason?: string } = {
    sent: false,
    reason: 'geen overdue',
  };

  if (overdueToday.length > 0) {
    const missedDays = await consecutiveMissedDays(now);
    const tier = pickEmailTier(missedDays);
    if (!tier) {
      emailResult = { sent: false, reason: 'minder dan 2 dagen gemist — push handelt af' };
    } else if (await hasReminderBeenSent(todayDate, tier)) {
      emailResult = { sent: false, tier, reason: 'al verstuurd vandaag' };
    } else {
      try {
        await sendReminderEmail({
          tier,
          missedToday: overdueToday,
          consecutiveMissedDays: missedDays + 1,
        });
        await recordReminderSent(todayDate, tier);
        emailResult = { sent: true, tier };
      } catch (err) {
        return NextResponse.json(
          {
            error: err instanceof Error ? err.message : 'Mail verzenden mislukt',
            push: pushAttempts,
          },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({
    now: { date: todayDate, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` },
    quietHours: inQuietHours(hour),
    push: pushAttempts,
    email: emailResult,
  });
}
