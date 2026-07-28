import { NextResponse } from 'next/server';

export const runtime = 'edge'; // Edge is fine here since no fs operations are needed

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { videoId } = await req.json();
    console.log(`[FALLBACK-START] ▶ Started | videoId: ${videoId}`);
    if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST;

    if (!rapidApiKey || !rapidApiHost) {
      console.log(`[FALLBACK-START] ✗ Missing env vars | RAPIDAPI_KEY: ${rapidApiKey ? 'SET' : 'MISSING'} | RAPIDAPI_HOST: ${rapidApiHost ? 'SET' : 'MISSING'}`);
      throw new Error('RapidAPI credentials not configured');
    }
    console.log(`[FALLBACK-START] ✓ Env vars loaded | Host: ${rapidApiHost}`);

    const downloadUrlApi = `https://${rapidApiHost}/api/v1/download?format=mp3&id=${videoId}&audioQuality=128&addInfo=false&allowExtendedDuration=false`;
    console.log(`[FALLBACK-START] → Calling RapidAPI: ${downloadUrlApi}`);
    
    const downloadRes = await fetch(downloadUrlApi, {
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey
      }
    });
    
    const downloadData = await downloadRes.json();
    console.log(`[FALLBACK-START] ← RapidAPI response (${downloadRes.status}): ${JSON.stringify(downloadData).substring(0, 500)}`);
    
    if (!downloadData.success || !downloadData.progressId) {
      console.log(`[FALLBACK-START] ✗ RapidAPI failed | success=${downloadData.success} progressId=${downloadData.progressId}`);
      throw new Error('RapidAPI download failed: ' + JSON.stringify(downloadData));
    }

    console.log(`[FALLBACK-START] ✅ COMPLETE | progressId: ${downloadData.progressId} (${Date.now() - startTime}ms)`);
    return NextResponse.json({ progressId: downloadData.progressId });
  } catch (error: any) {
    console.error(`[FALLBACK-START] ❌ FATAL: ${error.message} (${Date.now() - startTime}ms)`);
    return NextResponse.json({ error: error.message || 'An error occurred during processing' }, { status: 500 });
  }
}
