import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { sendBracketPush } from '@/lib/push';
import { todayISO } from '@/lib/status';

export const runtime = 'nodejs';

interface SendBody {
  bracket?: string;
  trigger_type?: string;
  title?: string;
  body?: string;
  url?: string;
  date?: string;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  // Even al is dit een interne route, de URL is publiek bereikbaar.
  // Beschermen met dezelfde secret als de cron — als die niet gezet is, weigeren.
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'REMINDER_CRON_SECRET niet ingesteld' },
      { status: 401 },
    );
  }
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }

  if (!body.bracket || !body.trigger_type || !body.title || !body.body) {
    return NextResponse.json(
      { error: 'bracket, trigger_type, title, body zijn verplicht' },
      { status: 400 },
    );
  }

  const result = await sendBracketPush({
    date: body.date ?? todayISO(),
    bracket: body.bracket,
    triggerType: body.trigger_type,
    payload: {
      title: body.title,
      body: body.body,
      tag: `${body.bracket}-${body.trigger_type}`,
      url: body.url ?? '/',
    },
  });

  return NextResponse.json(result);
}
