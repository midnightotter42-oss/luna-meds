import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SLOT_EMOJI, SLOT_LABEL, SLOT_ORDER, groupBySlot } from '@/lib/medications';
import { getLogsForDateWithoutPhotos, type LogEntryNoPhoto } from '@/lib/db';
import { amsterdamParts } from '@/lib/status';
import { getMedicationsForDate } from '@/lib/schedule';
import HistoryPhoto from './photo-client';

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function parseISO(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function formatDutchDate(d: Date): string {
  const { weekday, day, month, year } = amsterdamParts(d);
  return `${DAY_NAMES[weekday]} ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

export default async function HistoryDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const parsed = parseISO(date);
  if (!parsed) notFound();

  const [logs, meds] = await Promise.all([
    getLogsForDateWithoutPhotos(date),
    getMedicationsForDate(parsed),
  ]);

  const logByMed = new Map<string, LogEntryNoPhoto>();
  for (const log of logs) {
    if (log.taken === 1 && !logByMed.has(log.medication_id)) {
      logByMed.set(log.medication_id, log);
    }
  }
  const groups = groupBySlot(meds);

  const noSchedule = meds.length === 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <Link href="/history" className="text-sm text-luna-accent">
          ← Terug naar overzicht
        </Link>
        <h1 className="text-2xl font-semibold text-slate-800 capitalize mt-2">
          {formatDutchDate(parsed)}
        </h1>
      </div>

      {noSchedule && (
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center text-slate-500">
          Geen medicatie gepland voor deze dag.
        </div>
      )}

      {SLOT_ORDER.map((slot) => {
        const slotMeds = groups[slot];
        if (slotMeds.length === 0) return null;
        return (
          <section key={slot} className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2 px-1">
              <span>{SLOT_EMOJI[slot]}</span>
              <span>{SLOT_LABEL[slot]}</span>
            </h2>
            <div className="space-y-3">
              {slotMeds.map((m) => {
                const log = logByMed.get(m.id);
                const taken = !!log;
                return (
                  <div
                    key={m.id}
                    className={`rounded-2xl border-2 p-4 ${
                      taken
                        ? 'border-luna-green bg-green-50'
                        : m.required
                        ? 'border-luna-red bg-red-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800">{m.name}</h3>
                        <p className="text-xs text-slate-500">Gepland om {m.time}</p>
                        {taken && log?.time_taken && (
                          <p className="text-xs text-luna-green mt-1 font-medium">
                            Genomen om {log.time_taken}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {taken ? (
                          <span className="text-luna-green text-xl">✓</span>
                        ) : m.required ? (
                          <span className="text-luna-red text-sm font-medium">gemist</span>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </div>
                    </div>
                    {taken && log?.has_photo && (
                      <div className="mt-3">
                        <HistoryPhoto logId={log.id} medName={m.name} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
