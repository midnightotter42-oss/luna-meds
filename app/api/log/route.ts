import { NextResponse } from 'next/server';
import { createLog } from '@/lib/db';
import { timeHHMM, todayISO } from '@/lib/status';
import type { LogEntry } from '@/lib/types';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]);

interface ParsedBody {
  medicationIds: string[];
  date: string;
  photoPath: string | null;
}

type ParseResult = ParsedBody | { error: string; status: number };

function validateDate(raw: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function validateBase64Photo(dataUrl: string): { ok: true; value: string } | { ok: false; error: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return { ok: false, error: 'Ongeldige foto data URL' };
  const mime = m[1];
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: 'Bestandstype niet ondersteund' };
  const approxBytes = Math.floor((m[2].length * 3) / 4);
  if (approxBytes > MAX_BYTES) return { ok: false, error: 'Foto te groot (max 8MB)' };
  return { ok: true, value: dataUrl };
}

async function parseRequest(request: Request): Promise<ParseResult> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return { error: 'Ongeldige JSON', status: 400 };
    }

    let ids: string[] = [];
    if (Array.isArray(body.medication_ids)) {
      ids = body.medication_ids.map((v) => String(v)).filter(Boolean);
    } else if (typeof body.medication_id === 'string' && body.medication_id) {
      ids = [body.medication_id];
    }

    const dateRaw = typeof body.date === 'string' ? body.date : todayISO();
    const date = validateDate(dateRaw);
    if (!date) return { error: 'Ongeldige datum', status: 400 };

    let photoPath: string | null = null;
    if (typeof body.photo === 'string' && body.photo.length > 0) {
      const v = validateBase64Photo(body.photo);
      if (!v.ok) return { error: v.error, status: 400 };
      photoPath = v.value;
    }

    return { medicationIds: ids, date, photoPath };
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { error: 'Ongeldige body, verwacht multipart/form-data of JSON', status: 400 };
  }

  let ids: string[] = formData
    .getAll('medication_ids')
    .flatMap((v) => String(v).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    const single = formData.get('medication_id');
    if (single) ids = [String(single)];
  }

  const dateRaw = String(formData.get('date') ?? todayISO());
  const date = validateDate(dateRaw);
  if (!date) return { error: 'Ongeldige datum', status: 400 };

  let photoPath: string | null = null;
  const photo = formData.get('photo');
  if (photo && photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_BYTES) {
      return { error: 'Foto te groot (max 8MB)', status: 400 };
    }
    const mime = photo.type || 'image/jpeg';
    if (!ALLOWED_MIME.has(mime)) {
      return { error: 'Bestandstype niet ondersteund', status: 400 };
    }
    const bytes = Buffer.from(await photo.arrayBuffer());
    photoPath = `data:${mime};base64,${bytes.toString('base64')}`;
  } else if (typeof photo === 'string' && photo.length > 0) {
    const v = validateBase64Photo(photo);
    if (!v.ok) return { error: v.error, status: 400 };
    photoPath = v.value;
  }

  return { medicationIds: ids, date, photoPath };
}

export async function POST(request: Request) {
  const parsed = await parseRequest(request);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { date, photoPath } = parsed;
  const medicationIds = Array.from(new Set(parsed.medicationIds));
  if (medicationIds.length === 0) {
    return NextResponse.json({ error: 'medication_ids ontbreekt' }, { status: 400 });
  }
  for (const id of medicationIds) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      return NextResponse.json({ error: `Ongeldige medication_id: ${id}` }, { status: 400 });
    }
  }

  const time = timeHHMM();
  const logs: LogEntry[] = [];
  for (let i = 0; i < medicationIds.length; i++) {
    const id = medicationIds[i];
    const log = await createLog({
      date,
      time_taken: time,
      medication_id: id,
      taken: 1,
      photo_path: i === 0 ? photoPath : null,
    });
    logs.push(log);
  }

  return NextResponse.json({ ok: true, logs });
}
