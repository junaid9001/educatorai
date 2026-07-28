import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';
import { Innertube } from 'youtubei.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import translate from 'google-translate-api-x';
import Groq from 'groq-sdk';
import { supabase } from '@/lib/supabase';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Use Node.js runtime, as Edge does not support fs or ytdl-core easily
export const runtime = 'nodejs';
// Allow up to 60 seconds (Hobby tier max) for processing
export const maxDuration = 60; 

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { url } = await req.json();
    console.log(`[PROCESS] ▶ Started | URL: ${url}`);

    // Step 1: Extract Video ID
    let videoId = '';
    try {
      const parsedUrl = new URL(url);
      videoId = parsedUrl.searchParams.get('v') || parsedUrl.pathname.split('/').pop() || '';
    } catch {
      videoId = url.split('/').pop() || '';
    }
    
    if (!videoId) {
      console.log(`[PROCESS] ✗ Invalid URL - no videoId extracted`);
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }
    console.log(`[PROCESS] ✓ Step 1: Video ID extracted = ${videoId} (${Date.now() - startTime}ms)`);

    // Step 2: Fetch Transcript
    let rawTranscriptText = '';
    try {
      console.log(`[PROCESS] → Step 2: Fetching transcript via youtube-transcript...`);
      const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
      rawTranscriptText = transcriptArray.map(t => t.text).join(' ');
      console.log(`[PROCESS] ✓ Step 2: Transcript fetched | ${rawTranscriptText.length} chars (${Date.now() - startTime}ms)`);
    } catch (e: any) {
      console.log(`[PROCESS] ✗ Step 2: Transcript FAILED: ${e.message} | Triggering fallback (${Date.now() - startTime}ms)`);
      return NextResponse.json({ fallbackRequired: true, videoId });
    }

    if (!rawTranscriptText || rawTranscriptText.trim().length === 0) {
      console.log(`[PROCESS] ✗ Step 2: Transcript returned empty text`);
      throw new Error("Transcription failed or returned empty text.");
    }

    // Step 3: Truncate
    const MAX_CHARS = 15000;
    if (rawTranscriptText.length > MAX_CHARS) {
      rawTranscriptText = rawTranscriptText.substring(0, MAX_CHARS);
      console.log(`[PROCESS] ⚠ Step 3: Truncated to ${MAX_CHARS} chars`);
    }

    // Step 4: Translate
    let transcriptText = '';
    try {
      console.log(`[PROCESS] → Step 4: Translating to English...`);
      const chunks = rawTranscriptText.match(/.{1,4500}(\s|$)/g) || [rawTranscriptText];
      const translatedChunks = await translate(chunks, { to: 'en' });
      
      if (Array.isArray(translatedChunks)) {
        transcriptText = (translatedChunks as any[]).map(res => res.text).join(' ');
      } else {
        transcriptText = (translatedChunks as any).text;
      }
      console.log(`[PROCESS] ✓ Step 4: Translated | ${transcriptText.length} chars (${Date.now() - startTime}ms)`);
    } catch (e: any) {
      console.log(`[PROCESS] ⚠ Step 4: Translation FAILED: ${e.message} | Using raw text`);
      transcriptText = rawTranscriptText;
    }

    // Step 5: Generate Q&A with LLaMA
    console.log(`[PROCESS] → Step 5: Generating Q&A via Groq LLaMA...`);
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert educational curriculum designer specifically teaching 10th standard (SSLC) students. Your task is to generate thoughtful, exam-focused Questions and Answers based on the core educational concepts in the provided video transcript. Create as many questions as necessary to cover all the important topics in the transcript (do not force a specific number, just cover the core material).\n\nCRITICAL INSTRUCTIONS:\n- The transcript is from a livestream. Completely IGNORE all conversational chatter, reading of live comments, teacher pauses, or off-topic remarks.\n- Focus ONLY on the core academic subject matter being taught.\n- Tailor the difficulty of the questions specifically to a 10th grade student\'s level.\n- Output ONLY valid JSON in the exact following format: {"qa": [{"question": "...", "answer": "..."}]}. Do not include markdown formatting, backticks, or any other text.'
        },
        {
          role: 'user',
          content: `Transcript: ${transcriptText}`
        }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    console.log(`[PROCESS] ✓ Step 5: LLaMA responded (${Date.now() - startTime}ms)`);

    // Step 6: Parse JSON
    const qaContent = completion.choices[0]?.message?.content;
    
    if (!qaContent) {
      throw new Error("No content received from AI.");
    }
    
    let finalJson;
    try {
       const jsonMatch = qaContent.match(/\{[\s\S]*\}/);
       const jsonStr = jsonMatch ? jsonMatch[0] : qaContent;
       finalJson = JSON.parse(jsonStr);
       console.log(`[PROCESS] ✓ Step 6: JSON parsed | ${finalJson.qa?.length || 0} Q&As generated`);
    } catch (e) {
       console.log(`[PROCESS] ✗ Step 6: JSON parse FAILED | Raw output: ${qaContent.substring(0, 200)}`);
       throw new Error("The AI did not output valid JSON format. Try again.");
    }

    // Step 7: Save to Supabase
    try {
      console.log(`[PROCESS] → Step 7: Saving to Supabase...`);
      const { error: dbError } = await supabase
        .from('qna_sessions')
        .insert([{ video_url: url, qa_data: finalJson.qa }]);

      if (dbError) {
        console.log(`[PROCESS] ⚠ Step 7: Supabase save FAILED: ${JSON.stringify(dbError)}`);
      } else {
        console.log(`[PROCESS] ✓ Step 7: Saved to Supabase (${Date.now() - startTime}ms)`);
      }
    } catch (dbEx: any) {
      console.log(`[PROCESS] ⚠ Step 7: Supabase exception: ${dbEx.message}`);
    }

    console.log(`[PROCESS] ✅ COMPLETE | Total time: ${Date.now() - startTime}ms`);
    return NextResponse.json(finalJson);
  } catch (error: any) {
    console.error(`[PROCESS] ❌ FATAL ERROR: ${error.message} | Total time: ${Date.now() - startTime}ms`);
    return NextResponse.json({ error: error.message || 'An error occurred during processing' }, { status: 500 });
  }
}
