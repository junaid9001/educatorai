import { NextResponse } from 'next/server';

export const runtime = 'edge'; // Edge is fine here since no fs operations are needed

export async function POST(req: Request) {
  try {
    const { videoId } = await req.json();
    if (!videoId) return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST;

    if (!rapidApiKey || !rapidApiHost) {
      throw new Error('RapidAPI credentials not configured');
    }

    const downloadUrlApi = `https://${rapidApiHost}/api/v1/download?format=mp3&id=${videoId}&audioQuality=128&addInfo=false&allowExtendedDuration=false`;
    
    const downloadRes = await fetch(downloadUrlApi, {
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey
      }
    });
    
    const downloadData = await downloadRes.json();
    
    if (!downloadData.success || !downloadData.progressId) {
      throw new Error('RapidAPI download failed: ' + JSON.stringify(downloadData));
    }

    return NextResponse.json({ progressId: downloadData.progressId });
  } catch (error: any) {
    console.error('Fallback Start API Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during processing' }, { status: 500 });
  }
}
