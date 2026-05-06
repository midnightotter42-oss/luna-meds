import { Pool } from 'pg';
import type { LogEntry } from './types';

let _pool: Pool | null = null;
function getPool(): Pool {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL niet gezet');
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return _pool;
}

let _initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  if (_initPromise) return _initPromise;
  const pool = getPool();
  _initPromise = (async () => {
    await pool.query(`
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
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_date_med ON logs(date, medication_id)`);
    // Ruim duplicaten op voor de unique index aangemaakt wordt
    await pool.query(`
      DELETE FROM logs WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY date, medication_id ORDER BY id) AS rn
          FROM logs WHERE taken = 1
        ) sub WHERE rn > 1
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_unique_taken
        ON logs(date, medication_id) WHERE taken = 1
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_schedule (
        id SERIAL PRIMARY KEY,
        day_of_week INTEGER NOT NULL,
        medication_id TEXT NOT NULL,
        time TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        notes TEXT,
        UNIQUE(day_of_week, medication_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_custom_schedule_day ON custom_schedule(day_of_week)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminder_log (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        tier TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reminder_log_date ON reminder_log(date)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_log (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        bracket TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_push_log_unique
        ON push_log(date, bracket, trigger_type)
    `);
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
  const result = await getPool().query<LogEntry>(
    `INSERT INTO logs (date, time_taken, medication_id, taken, photo_path, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (date, medication_id) WHERE taken = 1
     DO UPDATE SET
       time_taken = EXCLUDED.time_taken,
       photo_path = COALESCE(EXCLUDED.photo_path, logs.photo_path)
     RETURNING *`,
    [
      input.date,
      input.time_taken,
      input.medication_id,
      input.taken,
      input.photo_path ?? null,
      input.notes ?? null,
    ],
  );
  return result.rows[0];
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
  const result = await getPool().query<LogEntryNoPhoto>(
    `SELECT id, date, time_taken, medication_id, taken, notes, created_at,
            (photo_path IS NOT NULL) AS has_photo
     FROM logs WHERE date = $1 ORDER BY created_at DESC`,
    [date],
  );
  return result.rows;
}

export async function getLogsForDateRangeWithoutPhotos(
  fromDate: string,
  toDate: string,
): Promise<LogEntryNoPhoto[]> {
  await initDb();
  const result = await getPool().query<LogEntryNoPhoto>(
    `SELECT id, date, time_taken, medication_id, taken, notes, created_at,
            (photo_path IS NOT NULL) AS has_photo
     FROM logs
     WHERE date >= $1 AND date <= $2
     ORDER BY date ASC, created_at DESC`,
    [fromDate, toDate],
  );
  return result.rows;
}

export async function getLogPhoto(id: number): Promise<string | null> {
  await initDb();
  const result = await getPool().query<{ photo_path: string | null }>(
    `SELECT photo_path FROM logs WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0]?.photo_path ?? null;
}

export async function hasReminderBeenSent(date: string, tier: string): Promise<boolean> {
  await initDb();
  const result = await getPool().query(
    `SELECT 1 FROM reminder_log WHERE date = $1 AND tier = $2 LIMIT 1`,
    [date, tier],
  );
  return result.rows.length > 0;
}

export async function recordReminderSent(date: string, tier: string): Promise<void> {
  await initDb();
  await getPool().query(
    `INSERT INTO reminder_log (date, tier) VALUES ($1, $2)`,
    [date, tier],
  );
}

export async function getLogsForDate(date: string): Promise<LogEntry[]> {
  await initDb();
  const result = await getPool().query<LogEntry>(
    `SELECT * FROM logs WHERE date = $1 ORDER BY created_at DESC`,
    [date],
  );
  return result.rows;
}

export async function getLogsForDateRange(fromDate: string, toDate: string): Promise<LogEntry[]> {
  await initDb();
  const result = await getPool().query<LogEntry>(
    `SELECT * FROM logs
     WHERE date >= $1 AND date <= $2
     ORDER BY date ASC, created_at DESC`,
    [fromDate, toDate],
  );
  return result.rows;
}

export async function getLatestLogForMedicationOnDate(
  medicationId: string,
  date: string,
): Promise<LogEntry | undefined> {
  await initDb();
  const result = await getPool().query<LogEntry>(
    `SELECT * FROM logs
     WHERE medication_id = $1 AND date = $2 AND taken = 1
     ORDER BY created_at DESC
     LIMIT 1`,
    [medicationId, date],
  );
  return result.rows[0];
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
  const result = await getPool().query<ScheduleRow>(
    `SELECT * FROM custom_schedule ORDER BY day_of_week ASC, time ASC`,
  );
  return result.rows;
}

export async function getCustomScheduleForDay(dayOfWeek: number): Promise<ScheduleRow[]> {
  await initDb();
  const result = await getPool().query<ScheduleRow>(
    `SELECT * FROM custom_schedule WHERE day_of_week = $1 ORDER BY time ASC`,
    [dayOfWeek],
  );
  return result.rows;
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
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM custom_schedule');
    for (const e of entries) {
      await client.query(
        `INSERT INTO custom_schedule (day_of_week, medication_id, time, enabled, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [e.day_of_week, e.medication_id, e.time, e.enabled, e.notes ?? null],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  await getPool().query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth`,
    [input.endpoint, input.p256dh, input.auth],
  );
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await initDb();
  await getPool().query(
    `DELETE FROM push_subscriptions WHERE endpoint = $1`,
    [endpoint],
  );
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  await initDb();
  const result = await getPool().query<PushSubscriptionRow>(
    `SELECT id, endpoint, p256dh, auth, created_at FROM push_subscriptions`,
  );
  return result.rows;
}

export async function hasPushBeenSent(
  date: string,
  bracket: string,
  triggerType: string,
): Promise<boolean> {
  await initDb();
  const result = await getPool().query(
    `SELECT 1 FROM push_log
     WHERE date = $1 AND bracket = $2 AND trigger_type = $3
     LIMIT 1`,
    [date, bracket, triggerType],
  );
  return result.rows.length > 0;
}

export async function recordPushSent(
  date: string,
  bracket: string,
  triggerType: string,
): Promise<boolean> {
  await initDb();
  const result = await getPool().query(
    `INSERT INTO push_log (date, bracket, trigger_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (date, bracket, trigger_type) DO NOTHING
     RETURNING id`,
    [date, bracket, triggerType],
  );
  return result.rows.length > 0;
}
