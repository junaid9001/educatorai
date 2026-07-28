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

    const downloadUrlApi = `https://${rapidApiHost}/dl?id=${videoId}`;
    console.log(`[FALLBACK-START] → Calling RapidAPI: ${downloadUrlApi}`);
    
    const downloadRes = await fetch(downloadUrlApi, {
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey
      }
    });
    
    const downloadData = await downloadRes.json();
    console.log(`[FALLBACK-START] ← RapidAPI response (${downloadRes.status}): ${JSON.stringify(downloadData).substring(0, 500)}`);
    
    // Handle direct-link APIs (like youtube-mp36) that return a "link" field immediately
    if (downloadData.status === 'ok' && downloadData.link) {
      console.log(`[FALLBACK-START] ✅ COMPLETE (direct link) | URL: ${downloadData.link.substring(0, 80)}... (${Date.now() - startTime}ms)`);
      return NextResponse.json({ directUrl: downloadData.link });
    }

    // Handle polling-based APIs that return a progressId
    if (downloadData.success && downloadData.progressId) {
      console.log(`[FALLBACK-START] ✅ COMPLETE (polling) | progressId: ${downloadData.progressId} (${Date.now() - startTime}ms)`);
      return NextResponse.json({ progressId: downloadData.progressId });
    }

    console.log(`[FALLBACK-START] ✗ RapidAPI failed | Unrecognized response format`);
    throw new Error('RapidAPI download failed: ' + JSON.stringify(downloadData));
  } catch (error: any) {
    console.error(`[FALLBACK-START] ❌ FATAL: ${error.message} (${Date.now() - startTime}ms)`);
    return NextResponse.json({ error: error.message || 'An error occurred during processing' }, { status: 500 });
  }
}
