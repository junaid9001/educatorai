import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { progressId } = await req.json();
    if (!progressId) return NextResponse.json({ error: 'Missing progressId' }, { status: 400 });

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST;

    if (!rapidApiKey || !rapidApiHost) {
      console.log(`[FALLBACK-POLL] ✗ Missing env vars | RAPIDAPI_KEY: ${rapidApiKey ? 'SET' : 'MISSING'} | RAPIDAPI_HOST: ${rapidApiHost ? 'SET' : 'MISSING'}`);
      throw new Error('RapidAPI credentials not configured');
    }

    const progressRes = await fetch(`https://${rapidApiHost}/api/v1/progress?id=${progressId}`, {
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey
      },
      cache: 'no-store'
    });
    
    const progressData = await progressRes.json();
    console.log(`[FALLBACK-POLL] ← Progress (${progressRes.status}): finished=${progressData.finished} | ${JSON.stringify(progressData).substring(0, 300)}`);

    if (progressData.finished && progressData.downloadUrl) {
      console.log(`[FALLBACK-POLL] ✅ Audio ready | URL: ${progressData.downloadUrl.substring(0, 80)}...`);
      return NextResponse.json({ finished: true, downloadUrl: progressData.downloadUrl });
    }

    return NextResponse.json({ finished: false });
  } catch (error: any) {
    console.error(`[FALLBACK-POLL] ❌ FATAL: ${error.message}`);
    return NextResponse.json({ error: error.message || 'An error occurred during polling' }, { status: 500 });
  }
}
