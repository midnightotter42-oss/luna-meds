import { NextResponse } from 'next/server';
import { upsertPushSubscription, deletePushSubscription } from '@/lib/db';

export const runtime = 'nodejs';

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

interface UnsubscribeBody {
  endpoint?: string;
}

export async function POST(request: Request) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: 'endpoint en keys.p256dh / keys.auth zijn verplicht' },
      { status: 400 },
    );
  }
  await upsertPushSubscription({ endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: UnsubscribeBody;
  try {
    body = (await request.json()) as UnsubscribeBody;
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: 'endpoint is verplicht' }, { status: 400 });
  }
  await deletePushSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
