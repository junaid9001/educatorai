import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('qna_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50); // Get latest 50

    if (error) {
      console.error('Error fetching history:', error);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    return NextResponse.json({ history: data });
  } catch (err: any) {
    console.error('History API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
