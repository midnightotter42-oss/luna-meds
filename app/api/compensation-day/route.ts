import { NextResponse } from 'next/server';
import { insertCompensationDay } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  date?: unknown;
  reason?: unknown;
}

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }
  const date = typeof body.date === 'string' ? body.date : '';
  if (!isValidDate(date)) {
    return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason : '';
  await insertCompensationDay(date, reason);
  return NextResponse.json({ ok: true });
}
