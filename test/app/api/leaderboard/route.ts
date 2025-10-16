import 'server-only';
import { NextResponse } from 'next/server';
import { getLeaderboard, submitScore } from '@/lib/server/leaderboard';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const lb = await getLeaderboard();
    return NextResponse.json(lb, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').slice(0, 64);
    const score = Number(body?.score);
    const lb = await submitScore(name, score);
    return NextResponse.json(lb, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
