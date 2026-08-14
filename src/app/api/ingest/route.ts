import { NextResponse } from 'next/server';
import { runIngestion } from '@/lib/pipeline/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Scheduled ingestion (see vercel.json). Vercel cron sends the CRON_SECRET as a bearer token;
 * without it this endpoint would let anyone trigger a full provider run against your quota.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  try {
    const summary = await runIngestion();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
