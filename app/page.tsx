import Link from 'next/link';
import { getLogsForDate, getLogsForDateRange } from '@/lib/db';
import { attachStatus, todayISO } from '@/lib/status';
import { getMedicationsForDate, slotForTime } from '@/lib/schedule';
import { SLOT_LABEL } from '@/lib/medications';
import type { Slot, LogEntry } from '@/lib/types';
import ActiveMedCard from './components/ActiveMedCard';
import LogDrawer, { type LogDrawerDay, type LogDrawerEntry } from './components/LogDrawer';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function formatDutchDate(d: Date): string {
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function currentSlot(now: Date): Slot {
  const h = now.getHours();
  if (h < 12) return 'ochtend';
  if (h < 17) return 'middag';
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
  const allLogs = await getLogsForDateRange(fromDate, toDate);

  const todayDateISO = todayISO(today);

  const medsPerDay = await Promise.all(days.map((d) => getMedicationsForDate(d)));

  return days.map((d, i) => {
    const iso = todayISO(d);
    const meds = medsPerDay[i];
    const total = meds.length;

    const dayLogs = allLogs.filter((l) => l.date === iso && l.taken === 1);
    const seenMeds = new Set<string>();
    const dedupedLogs: LogEntry[] = [];
    for (const log of dayLogs) {
      if (!seenMeds.has(log.medication_id)) {
        seenMeds.add(log.medication_id);
        dedupedLogs.push(log);
      }
    }

    const entries: LogDrawerEntry[] = dedupedLogs.map((log) => {
      const med = meds.find((m) => m.id === log.medication_id);
      return {
        medication_id: log.medication_id,
        medication_name: med?.name ?? log.medication_id,
        time_taken: log.time_taken,
        scheduled_time: med?.time ?? '',
        photo_url: log.photo_path,
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

export default async function HomePage() {
  const now = new Date();
  const date = todayISO(now);
  const [meds, logs, logDays] = await Promise.all([
    getMedicationsForDate(now),
    getLogsForDate(date),
    buildLogDays(now),
  ]);
  const withStatus = attachStatus(meds, logs, now);

  const totalRequired = withStatus.filter((m) => m.required).length;
  const takenRequired = withStatus.filter((m) => m.required && m.status === 'taken').length;

  const slot = currentSlot(now);
  const pending = withStatus.filter((m) => m.status !== 'taken');
  const inSlot = pending.filter((m) => slotForTime(m.time) === slot);
  const activeMed = inSlot[0] ?? pending[0] ?? null;

  const allDoneForSlot = pending.length > 0 && inSlot.length === 0;
  const allDoneForDay = withStatus.length > 0 && pending.length === 0;
  const noScheduleAtAll = withStatus.length === 0;

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

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6">
        <div className="w-full max-w-md">
          {activeMed ? (
            <ActiveMedCard med={activeMed} date={date} />
          ) : allDoneForDay ? (
            <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 text-center animate-slide-up">
              <div className="text-6xl mb-3">🎉</div>
              <h2 className="text-2xl font-bold text-slate-800">Alles gedaan vandaag!</h2>
              <p className="text-slate-600 mt-2">Goed bezig 💖</p>
            </div>
          ) : allDoneForSlot ? (
            <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 text-center animate-slide-up">
              <div className="text-5xl mb-3">✅</div>
              <h2 className="text-2xl font-bold text-slate-800">
                Alles gedaan voor de {SLOT_LABEL[slot].toLowerCase()}!
              </h2>
              <p className="text-slate-600 mt-2">Volgende komt later op de dag.</p>
            </div>
          ) : noScheduleAtAll ? (
            <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 text-center animate-slide-up">
              <div className="text-5xl mb-3">😌</div>
              <h2 className="text-2xl font-bold text-slate-800">Geen medicatie vandaag</h2>
              <p className="text-slate-600 mt-2">Vrije dag — geniet ervan!</p>
            </div>
          ) : (
            <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 text-center animate-slide-up">
              <div className="text-5xl mb-3">😌</div>
              <h2 className="text-2xl font-bold text-slate-800">Geen medicatie nu</h2>
              <p className="text-slate-600 mt-2">Goed gedaan vandaag!</p>
            </div>
          )}

          {totalRequired > 0 && (
            <div className="mt-5 bg-white/15 backdrop-blur rounded-2xl px-5 py-3 border border-white/20">
              <div className="flex items-center justify-between text-white">
                <span className="text-sm">Vandaag</span>
                <span className="text-sm font-semibold">
                  {takenRequired}/{totalRequired} verplicht
                </span>
              </div>
              <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white transition-all"
                  style={{
                    width: totalRequired
                      ? `${(takenRequired / totalRequired) * 100}%`
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
