import { NextResponse } from 'next/server';
import { createLog, getLogsForDate } from '@/lib/db';
import { getMedicationsForDate } from '@/lib/schedule';
import { timeHHMM, todayISO } from '@/lib/status';
import type { Slot } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_BRACKETS: ReadonlyArray<Slot> = ['ochtend', 'middag', 'avond'];

interface Body {
  bracket?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }
  const bracket = body.bracket;
  if (!bracket || !VALID_BRACKETS.includes(bracket as Slot)) {
    return NextResponse.json(
      { error: 'bracket moet ochtend, middag of avond zijn' },
      { status: 400 },
    );
  }

  const now = new Date();
  const date = todayISO(now);
  const time = timeHHMM(now);

  const [meds, logs] = await Promise.all([getMedicationsForDate(now), getLogsForDate(date)]);
  const slotMeds = meds.filter((m) => m.slot === bracket);
  const takenIds = new Set(logs.filter((l) => l.taken === 1).map((l) => l.medication_id));
  const ungelogd = slotMeds.filter((m) => !takenIds.has(m.id));

  const logged: string[] = [];
  for (const m of ungelogd) {
    await createLog({
      date,
      time_taken: time,
      medication_id: m.id,
      taken: 1,
    });
    logged.push(m.id);
  }

  return NextResponse.json({ logged });
}
