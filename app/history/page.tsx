import Link from 'next/link';
import { MEDICATIONS } from '@/lib/medications';
import { getLogsForDateRange } from '@/lib/db';
import { amsterdamParts, todayISO } from '@/lib/status';
import type { LogEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DAY_NAMES_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

function isoDate(d: Date): string {
  return todayISO(d);
}

function getLast7Days(): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }
  return days;
}

function indexLogs(logs: LogEntry[]): Map<string, LogEntry> {
  const map = new Map<string, LogEntry>();
  for (const log of logs) {
    if (log.taken !== 1) continue;
    const key = `${log.date}::${log.medication_id}`;
    if (!map.has(key)) map.set(key, log);
  }
  return map;
}

export default async function HistoryPage() {
  const days = getLast7Days();
  const fromDate = isoDate(days[0]);
  const toDate = isoDate(days[days.length - 1]);
  const logs = await getLogsForDateRange(fromDate, toDate);
  const logIndex = indexLogs(logs);
  const today = todayISO();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-800">Terugkijken</h1>
        <p className="text-sm text-slate-500 mt-1">Afgelopen 7 dagen</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left text-slate-500 font-medium pb-3 pr-2 sticky left-0 bg-white">
                Medicijn
              </th>
              {days.map((d) => {
                const iso = isoDate(d);
                const isToday = iso === today;
                const parts = amsterdamParts(d);
                return (
                  <th key={iso} className="text-center font-medium pb-3 px-1 min-w-[44px]">
                    <Link
                      href={`/history/${iso}`}
                      className={`block hover:text-luna-accent ${isToday ? 'text-luna-accent' : 'text-slate-500'}`}
                    >
                      <div className="text-xs uppercase">{DAY_NAMES_SHORT[parts.weekday]}</div>
                      <div className="text-base font-semibold">{parts.day}</div>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {MEDICATIONS.map((med) => (
              <tr key={med.id} className="border-t border-slate-100">
                <td className="py-3 pr-2 sticky left-0 bg-white">
                  <div className="font-medium text-slate-700 truncate max-w-[140px]">{med.name}</div>
                  <div className="text-xs text-slate-400">{med.time}</div>
                </td>
                {days.map((d) => {
                  const iso = isoDate(d);
                  const key = `${iso}::${med.id}`;
                  const log = logIndex.get(key);
                  const isFuture = iso > today;
                  let cell: React.ReactNode;
                  if (log) {
                    cell = (
                      <Link
                        href={`/history/${iso}`}
                        className="block w-8 h-8 mx-auto rounded-lg bg-luna-green text-white flex items-center justify-center text-sm hover:opacity-80"
                        aria-label="genomen"
                      >
                        ✓
                      </Link>
                    );
                  } else if (isFuture) {
                    cell = <div className="block w-8 h-8 mx-auto rounded-lg bg-slate-50" aria-label="toekomst" />;
                  } else if (med.required) {
                    cell = (
                      <Link
                        href={`/history/${iso}`}
                        className="block w-8 h-8 mx-auto rounded-lg bg-luna-red/80 text-white flex items-center justify-center text-sm hover:opacity-80"
                        aria-label="gemist"
                      >
                        ✗
                      </Link>
                    );
                  } else {
                    cell = (
                      <Link
                        href={`/history/${iso}`}
                        className="block w-8 h-8 mx-auto rounded-lg bg-slate-200 hover:opacity-80"
                        aria-label="niet genomen"
                      />
                    );
                  }
                  return (
                    <td key={iso} className="py-2 px-1 text-center">
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap gap-4 text-sm text-slate-600">
        <Legend color="bg-luna-green" label="Genomen" />
        <Legend color="bg-luna-red/80" label="Gemist (verplicht)" />
        <Legend color="bg-slate-200" label="Niet genomen (optioneel)" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-4 h-4 rounded ${color}`} />
      <span>{label}</span>
    </div>
  );
}
