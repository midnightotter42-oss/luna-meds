import Link from 'next/link';
import { getLogsForDate, getLogsForDateRangeWithoutPhotos, type LogEntryNoPhoto } from '@/lib/db';
import { amsterdamParts, attachStatus, isEssential, todayISO } from '@/lib/status';
import { getMedicationsForDate } from '@/lib/schedule';
import { SLOT_ORDER, groupBySlot } from '@/lib/medications';
import type { MedicationWithStatus, Slot } from '@/lib/types';
import TodayBoard from './components/TodayBoard';
import type { CarryOverItem } from './components/SlotBlock';
import LogDrawer, { type LogDrawerDay, type LogDrawerEntry } from './components/LogDrawer';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function formatDutchDate(d: Date): string {
  const { weekday, day, month } = amsterdamParts(d);
  return `${DAY_NAMES[weekday]} ${day} ${MONTH_NAMES[month - 1]}`;
}

function currentSlot(now: Date): Slot {
  const { hour } = amsterdamParts(now);
  if (hour < 12) return 'ochtend';
  if (hour < 18) return 'middag';
  return 'avond';
}

function buildDayLabel(d: Date, todayDateISO: string): string {
  const iso = todayISO(d);
  if (iso === todayDateISO) return 'Vandaag';
  const yesterday = new Date(d);
  yesterday.setDate(d.getDate() + 1);
  if (todayISO(yesterday) === todayDateISO) return 'Gisteren';
  return formatDutchDate(d);
}

async function buildLogDays(today: Date): Promise<LogDrawerDay[]> {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  const fromDate = todayISO(days[days.length - 1]);
  const toDate = todayISO(days[0]);
  const allLogs = await getLogsForDateRangeWithoutPhotos(fromDate, toDate);

  const todayDateISO = todayISO(today);

  const medsPerDay = await Promise.all(days.map((d) => getMedicationsForDate(d)));

  return days.map((d, i) => {
    const iso = todayISO(d);
    const meds = medsPerDay[i];
    const total = meds.length;

    const dayLogs = allLogs.filter((l) => l.date === iso && l.taken === 1);
    const seenMeds = new Set<string>();
    const dedupedLogs: LogEntryNoPhoto[] = [];
    for (const log of dayLogs) {
      if (!seenMeds.has(log.medication_id)) {
        seenMeds.add(log.medication_id);
        dedupedLogs.push(log);
      }
    }

    const entries: LogDrawerEntry[] = dedupedLogs.map((log) => {
      const med = meds.find((m) => m.id === log.medication_id);
      return {
        log_id: log.id,
        medication_id: log.medication_id,
        medication_name: med?.name ?? log.medication_id,
        time_taken: log.time_taken,
        scheduled_time: med?.time ?? '',
        has_photo: log.has_photo,
      };
    });

    return {
      date: iso,
      label: buildDayLabel(d, todayDateISO),
      taken: dedupedLogs.length,
      total,
      entries,
    };
  });
}

function positionForSlot(slot: Slot, activeSlot: Slot): 'past' | 'current' | 'future' {
  const slotIdx = SLOT_ORDER.indexOf(slot);
  const activeIdx = SLOT_ORDER.indexOf(activeSlot);
  if (slotIdx < activeIdx) return 'past';
  if (slotIdx === activeIdx) return 'current';
  return 'future';
}

export default async function HomePage() {
  const now = new Date();
  const date = todayISO(now);
  const [meds, logs, logDays] = await Promise.all([
    getMedicationsForDate(now),
    getLogsForDate(date),
    buildLogDays(now),
  ]);
  const withStatus = attachStatus(meds, logs, now);

  const totalEssential = withStatus.filter(isEssential).length;
  const takenEssential = withStatus.filter((m) => isEssential(m) && m.status === 'taken').length;

  const activeSlot = currentSlot(now);
  const groups = groupBySlot(withStatus);

  const buckets = SLOT_ORDER.map((slot) => ({
    slot,
    meds: groups[slot],
    position: positionForSlot(slot, activeSlot),
  })).filter((b) => b.position !== 'future');

  const carryOver: CarryOverItem[] = [];
  for (const b of buckets) {
    if (b.position !== 'past') continue;
    for (const m of b.meds) {
      if (m.status !== 'taken' && isEssential(m)) {
        carryOver.push({ medicationId: m.id, name: m.name, fromSlot: b.slot });
      }
    }
  }

  const noScheduleAtAll = withStatus.length === 0;
  const allDoneForDay = !noScheduleAtAll && withStatus.every((m) => m.status === 'taken');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full max-w-md mx-auto px-5 pt-8 pb-2 flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold drop-shadow-sm">Hoi Luna 🌷</p>
          <p className="text-sm text-white/80 capitalize mt-0.5">{formatDutchDate(now)}</p>
        </div>
        <Link
          href="/settings"
          aria-label="Instellingen"
          className="bg-white/20 hover:bg-white/30 backdrop-blur rounded-full w-11 h-11 flex items-center justify-center text-xl border border-white/20 transition-colors"
        >
          ⚙️
        </Link>
      </header>

      <div className="flex-1 flex flex-col px-5 py-6">
        <div className="w-full max-w-md mx-auto space-y-4">
          {noScheduleAtAll ? (
            <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 text-center animate-slide-up">
              <div className="text-5xl mb-3">😌</div>
              <h2 className="text-2xl font-bold text-slate-800">Geen medicatie vandaag</h2>
              <p className="text-slate-600 mt-2">Vrije dag — geniet ervan!</p>
            </div>
          ) : (
            <>
              {allDoneForDay && (
                <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-6 text-center animate-slide-up">
                  <div className="text-5xl mb-2">🎉</div>
                  <h2 className="text-2xl font-bold text-slate-800">Alles gedaan vandaag!</h2>
                  <p className="text-slate-600 mt-1">Goed bezig 💖</p>
                </div>
              )}
              <TodayBoard date={date} buckets={buckets} carryOver={carryOver} />
            </>
          )}

          {totalEssential > 0 && (
            <div className="bg-white/15 backdrop-blur rounded-2xl px-5 py-3 border border-white/20">
              <div className="flex items-center justify-between text-white">
                <span className="text-sm">Essentiële medicatie</span>
                <span className="text-sm font-semibold">
                  {takenEssential}/{totalEssential}
                </span>
              </div>
              <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all"
                  style={{
                    width: totalEssential
                      ? `${(takenEssential / totalEssential) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <LogDrawer days={logDays} />
    </div>
  );
}
