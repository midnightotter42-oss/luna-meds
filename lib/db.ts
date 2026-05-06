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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_unique_taken
        ON logs(date, medication_id) WHERE taken = 1
    `;
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
    await sql`
      CREATE TABLE IF NOT EXISTS reminder_log (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        tier TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_reminder_log_date ON reminder_log(date)`;
    await sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS push_log (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        bracket TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_push_log_unique
        ON push_log(date, bracket, trigger_type)
    `;
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
    ON CONFLICT (date, medication_id) WHERE taken = 1
    DO UPDATE SET
      time_taken = EXCLUDED.time_taken,
      photo_path = COALESCE(EXCLUDED.photo_path, logs.photo_path)
    RETURNING *
  `) as LogEntry[];
  return rows[0];
}

export interface LogEntryNoPhoto {
  id: number;
  date: string;
  time_taken: string | null;
  medication_id: string;
  taken: number;
  notes: string | null;
  created_at: string;
  has_photo: boolean;
}

export async function getLogsForDateWithoutPhotos(date: string): Promise<LogEntryNoPhoto[]> {
  await initDb();
  return (await sql`
    SELECT id, date, time_taken, medication_id, taken, notes, created_at,
           (photo_path IS NOT NULL) AS has_photo
    FROM logs WHERE date = ${date} ORDER BY created_at DESC
  `) as LogEntryNoPhoto[];
}

export async function getLogsForDateRangeWithoutPhotos(
  fromDate: string,
  toDate: string,
): Promise<LogEntryNoPhoto[]> {
  await initDb();
  return (await sql`
    SELECT id, date, time_taken, medication_id, taken, notes, created_at,
           (photo_path IS NOT NULL) AS has_photo
    FROM logs
    WHERE date >= ${fromDate} AND date <= ${toDate}
    ORDER BY date ASC, created_at DESC
  `) as LogEntryNoPhoto[];
}

export async function getLogPhoto(id: number): Promise<string | null> {
  await initDb();
  const rows = (await sql`
    SELECT photo_path FROM logs WHERE id = ${id} LIMIT 1
  `) as Array<{ photo_path: string | null }>;
  return rows[0]?.photo_path ?? null;
}

export async function hasReminderBeenSent(date: string, tier: string): Promise<boolean> {
  await initDb();
  const rows = (await sql`
    SELECT 1 FROM reminder_log WHERE date = ${date} AND tier = ${tier} LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

export async function recordReminderSent(date: string, tier: string): Promise<void> {
  await initDb();
  await sql`
    INSERT INTO reminder_log (date, tier) VALUES (${date}, ${tier})
  `;
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

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export async function upsertPushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  await initDb();
  await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth)
    VALUES (${input.endpoint}, ${input.p256dh}, ${input.auth})
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth
  `;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await initDb();
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  await initDb();
  return (await sql`
    SELECT id, endpoint, p256dh, auth, created_at FROM push_subscriptions
  `) as PushSubscriptionRow[];
}

export async function hasPushBeenSent(
  date: string,
  bracket: string,
  triggerType: string,
): Promise<boolean> {
  await initDb();
  const rows = (await sql`
    SELECT 1 FROM push_log
    WHERE date = ${date} AND bracket = ${bracket} AND trigger_type = ${triggerType}
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

export async function recordPushSent(
  date: string,
  bracket: string,
  triggerType: string,
): Promise<boolean> {
  await initDb();
  const rows = (await sql`
    INSERT INTO push_log (date, bracket, trigger_type)
    VALUES (${date}, ${bracket}, ${triggerType})
    ON CONFLICT (date, bracket, trigger_type) DO NOTHING
    RETURNING id
  `) as unknown[];
  return rows.length > 0;
}
