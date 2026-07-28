import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { url, host, key, method = 'GET' } = await req.json();

    if (!url || !host || !key) {
      return NextResponse.json({ error: 'Missing url, host, or key' }, { status: 400 });
    }

    const response = await fetch(url, {
      method,
      headers: {
        'x-rapidapi-host': host,
        'x-rapidapi-key': key
      }
    });

    // Try to parse JSON, if it's text, return text
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { rawText: await response.text() };
    }

    return NextResponse.json({
      status: response.status,
      ok: response.ok,
      data
    });

  } catch (error: any) {
    console.error('Dev Proxy Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
