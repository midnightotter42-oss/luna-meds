import Link from 'next/link';
import { MEDICATIONS } from '@/lib/medications';
import { getFullWeekSchedule } from '@/lib/schedule';
import ScheduleEditor from '../components/ScheduleEditor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const schedule = await getFullWeekSchedule();
  const catalog = MEDICATIONS.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    required: m.required,
    defaultTime: m.time,
    defaultNotes: m.notes ?? null,
  }));

  return (
    <div className="min-h-screen flex flex-col pb-32">
      <header className="w-full max-w-md mx-auto px-5 pt-8 pb-4 flex items-center justify-between gap-3">
        <Link
          href="/"
          aria-label="Terug naar home"
          className="bg-white/20 hover:bg-white/30 backdrop-blur rounded-full w-11 h-11 flex items-center justify-center text-xl border border-white/20 transition-colors"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold drop-shadow-sm">Instellingen</h1>
        <div className="w-11" aria-hidden="true" />
      </header>

      <div className="flex-1 w-full max-w-md mx-auto px-5">
        <div className="bg-white/15 backdrop-blur rounded-2xl p-4 mb-5 text-white text-sm border border-white/20">
          Stel per dag van de week in welke medicijnen Luna inneemt en op welk tijdstip.
          {!schedule.hasCustom && (
            <span className="block mt-1 text-white/80">
              Nu actief: standaard schema uit het systeem.
            </span>
          )}
        </div>

        <ScheduleEditor initialSchedule={schedule} catalog={catalog} />
      </div>
    </div>
  );
}
