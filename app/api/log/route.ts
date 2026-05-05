import { NextResponse } from 'next/server';
import { createLog } from '@/lib/db';
import { getMedicationById } from '@/lib/medications';
import { timeHHMM, todayISO } from '@/lib/status';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']);

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Ongeldige body, verwacht multipart/form-data' }, { status: 400 });
  }

  const medicationId = String(formData.get('medication_id') ?? '');
  if (!medicationId || !getMedicationById(medicationId)) {
    return NextResponse.json({ error: 'Onbekende medication_id' }, { status: 400 });
  }
  const date = String(formData.get('date') ?? todayISO());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 });
  }

  const photo = formData.get('photo');
  let photoPath: string | null = null;

  if (photo && photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Foto te groot (max 8MB)' }, { status: 400 });
    }
    const mime = photo.type || 'image/jpeg';
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: 'Bestandstype niet ondersteund' }, { status: 400 });
    }
    const bytes = Buffer.from(await photo.arrayBuffer());
    photoPath = `data:${mime};base64,${bytes.toString('base64')}`;
  }

  const log = await createLog({
    date,
    time_taken: timeHHMM(),
    medication_id: medicationId,
    taken: 1,
    photo_path: photoPath,
  });

  return NextResponse.json({ ok: true, log });
}
