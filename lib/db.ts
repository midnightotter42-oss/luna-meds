import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { LogEntry } from './types';

let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL niet gezet');
  _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

const sql = new Proxy(function () {} as unknown as NeonQueryFunction<false, false>, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop) {
    return (getSql() as unknown as Record<string | symbol, unknown>)[prop];
  },
}) as NeonQueryFunction<false, false>;

export { sql };

let _initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        time_taken TEXT,
        medication_id TEXT NOT NULL,
        taken INTEGER DEFAULT 0,
        photo_path TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_date_med ON logs(date, medication_id)`;
    await sql`
      CREATE TABLE IF NOT EXISTS custom_schedule (
        id SERIAL PRIMARY KEY,
        day_of_week INTEGER NOT NULL,
        medication_id TEXT NOT NULL,
        time TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        notes TEXT,
        UNIQUE(day_of_week, medication_id)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_custom_schedule_day ON custom_schedule(day_of_week)`;
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

export interface CreateLogInput {
  date: string;
  time_taken: string;
  medication_id: string;
  taken: 0 | 1;
  photo_path?: string | null;
  notes?: string | null;
}

export async function createLog(input: CreateLogInput): Promise<LogEntry> {
  await initDb();
  const rows = (await sql`
    INSERT INTO logs (date, time_taken, medication_id, taken, photo_path, notes)
    VALUES (
      ${input.date},
      ${input.time_taken},
      ${input.medication_id},
      ${input.taken},
      ${input.photo_path ?? null},
      ${input.notes ?? null}
    )
    RETURNING *
  `) as LogEntry[];
  return rows[0];
}

export async function getLogsForDate(date: string): Promise<LogEntry[]> {
  await initDb();
  return (await sql`
    SELECT * FROM logs WHERE date = ${date} ORDER BY created_at DESC
  `) as LogEntry[];
}

export async function getLogsForDateRange(fromDate: string, toDate: string): Promise<LogEntry[]> {
  await initDb();
  return (await sql`
    SELECT * FROM logs
    WHERE date >= ${fromDate} AND date <= ${toDate}
    ORDER BY date ASC, created_at DESC
  `) as LogEntry[];
}

export async function getLatestLogForMedicationOnDate(
  medicationId: string,
  date: string,
): Promise<LogEntry | undefined> {
  await initDb();
  const rows = (await sql`
    SELECT * FROM logs
    WHERE medication_id = ${medicationId} AND date = ${date} AND taken = 1
    ORDER BY created_at DESC
    LIMIT 1
  `) as LogEntry[];
  return rows[0];
}

export interface ScheduleRow {
  id: number;
  day_of_week: number;
  medication_id: string;
  time: string;
  enabled: number;
  notes: string | null;
}

export async function getAllCustomSchedule(): Promise<ScheduleRow[]> {
  await initDb();
  return (await sql`
    SELECT * FROM custom_schedule ORDER BY day_of_week ASC, time ASC
  `) as ScheduleRow[];
}

export async function getCustomScheduleForDay(dayOfWeek: number): Promise<ScheduleRow[]> {
  await initDb();
  return (await sql`
    SELECT * FROM custom_schedule WHERE day_of_week = ${dayOfWeek} ORDER BY time ASC
  `) as ScheduleRow[];
}

export interface ScheduleEntryInput {
  day_of_week: number;
  medication_id: string;
  time: string;
  enabled: 0 | 1;
  notes?: string | null;
}

export async function replaceCustomSchedule(entries: ScheduleEntryInput[]): Promise<void> {
  await initDb();
  const queries = [
    sql`DELETE FROM custom_schedule`,
    ...entries.map(
      (e) => sql`
        INSERT INTO custom_schedule (day_of_week, medication_id, time, enabled, notes)
        VALUES (${e.day_of_week}, ${e.medication_id}, ${e.time}, ${e.enabled}, ${e.notes ?? null})
      `,
    ),
  ];
  await sql.transaction(queries);
}
