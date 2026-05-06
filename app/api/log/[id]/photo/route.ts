import { NextResponse } from 'next/server';
import { getLogPhoto } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 });
  }

  const photo = await getLogPhoto(numId);
  if (!photo) {
    return NextResponse.json({ error: 'Geen foto' }, { status: 404 });
  }

  return NextResponse.json(
    { photo },
    {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    },
  );
}
