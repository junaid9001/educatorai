import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { progressId } = await req.json();
    if (!progressId) return NextResponse.json({ error: 'Missing progressId' }, { status: 400 });

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST;

    if (!rapidApiKey || !rapidApiHost) {
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

    if (progressData.finished && progressData.downloadUrl) {
      return NextResponse.json({ finished: true, downloadUrl: progressData.downloadUrl });
    }

    return NextResponse.json({ finished: false });
  } catch (error: any) {
    console.error('Fallback Poll API Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during polling' }, { status: 500 });
  }
}
