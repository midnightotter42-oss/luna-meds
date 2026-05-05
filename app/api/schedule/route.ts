import { NextResponse } from 'next/server';
import { replaceCustomSchedule, type ScheduleEntryInput } from '@/lib/db';
import { getFullWeekSchedule } from '@/lib/schedule';
import { MEDICATIONS, getMedicationById } from '@/lib/medications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const schedule = await getFullWeekSchedule();
  const medCatalog = MEDICATIONS.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    required: m.required,
    defaultTime: m.time,
    defaultNotes: m.notes ?? null,
  }));
  return NextResponse.json({ schedule, medications: medCatalog });
}

interface ScheduleEntryBody {
  medication_id?: unknown;
  time?: unknown;
  enabled?: unknown;
  notes?: unknown;
}

interface ScheduleDayBody {
  day_of_week?: unknown;
  entries?: unknown;
}

interface SchedulePostBody {
  days?: unknown;
}

function isValidTime(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t);
}

export async function POST(request: Request) {
  let body: SchedulePostBody;
  try {
    body = (await request.json()) as SchedulePostBody;
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.days)) {
    return NextResponse.json({ error: 'days[] ontbreekt' }, { status: 400 });
  }

  const entries: ScheduleEntryInput[] = [];
  for (const dayRaw of body.days as ScheduleDayBody[]) {
    const dow = Number(dayRaw.day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return NextResponse.json({ error: 'day_of_week moet 0-6 zijn' }, { status: 400 });
    }
    if (!Array.isArray(dayRaw.entries)) continue;
    for (const e of dayRaw.entries as ScheduleEntryBody[]) {
      const medId = String(e.medication_id ?? '');
      if (!getMedicationById(medId)) {
        return NextResponse.json({ error: `Onbekend medicijn: ${medId}` }, { status: 400 });
      }
      const time = String(e.time ?? '');
      if (!isValidTime(time)) {
        return NextResponse.json({ error: `Ongeldige tijd: ${time}` }, { status: 400 });
      }
      const enabled: 0 | 1 = e.enabled === false ? 0 : 1;
      const notes = e.notes == null ? null : String(e.notes);
      entries.push({
        day_of_week: dow,
        medication_id: medId,
        time,
        enabled,
        notes,
      });
    }
  }

  try {
    await replaceCustomSchedule(entries);
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return NextResponse.json(
        { error: 'Medicijn mag maar 1x per dag voorkomen' },
        { status: 400 },
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, count: entries.length });
}
