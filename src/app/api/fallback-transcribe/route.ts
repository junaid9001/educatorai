import { NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import translate from 'google-translate-api-x';
import Groq from 'groq-sdk';
import { supabase } from '@/lib/supabase';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const runtime = 'nodejs';
export const maxDuration = 60; // We still allow 60s max, but this should only take 30-40s

export async function POST(req: Request) {
  try {
    const { downloadUrl, url } = await req.json();
    if (!downloadUrl || !url) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });

    const tmpDir = os.tmpdir();
    const fileName = `audio-${Date.now()}.mp3`;
    const filePath = path.join(tmpDir, fileName);

    let rawTranscriptText = '';

    try {
      console.log('Downloading audio file from proxy...');
      const audioRes = await fetch(downloadUrl);
      if (!audioRes.ok) throw new Error('Failed to download audio file from proxy');

      const fileStream = fs.createWriteStream(filePath);
      if (audioRes.body) {
         const reader = audioRes.body.getReader();
         while (true) {
           const { done, value } = await reader.read();
           if (done) break;
           if (value) {
             fileStream.write(Buffer.from(value));
           }
         }
      }
      fileStream.end();

      await new Promise<void>((resolve) => fileStream.on('finish', () => resolve()));

      console.log('Transcribing Audio using Whisper...');
      const transcriptionResponse: any = await groq.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-large-v3-turbo',
        response_format: 'text',
      });

      rawTranscriptText = typeof transcriptionResponse === 'string' ? transcriptionResponse : transcriptionResponse?.text;
    } catch (fallbackError: any) {
      console.error('Whisper fallback also failed:', fallbackError);
      throw new Error('Could not download proxy audio or transcribe using Whisper.');
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupErr) {
        console.error('Failed to delete temp audio file:', cleanupErr);
      }
    }

    if (!rawTranscriptText || rawTranscriptText.trim().length === 0) {
        throw new Error("Transcription failed or returned empty text.");
    }

    const MAX_CHARS = 15000;
    if (rawTranscriptText.length > MAX_CHARS) {
      rawTranscriptText = rawTranscriptText.substring(0, MAX_CHARS);
    }

    let transcriptText = '';
    try {
      const chunks = rawTranscriptText.match(/.{1,4500}(\s|$)/g) || [rawTranscriptText];
      const translatedChunks = await translate(chunks, { to: 'en' });
      
      if (Array.isArray(translatedChunks)) {
        transcriptText = (translatedChunks as any[]).map(res => res.text).join(' ');
      } else {
        transcriptText = (translatedChunks as any).text;
      }
    } catch (e) {
      console.error('Translation failed:', e);
      transcriptText = rawTranscriptText;
    }

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

    const qaContent = completion.choices[0]?.message?.content;
    
    if (!qaContent) {
      throw new Error("No content received from AI.");
    }
    
    let finalJson;
    try {
       const jsonMatch = qaContent.match(/\{[\s\S]*\}/);
       const jsonStr = jsonMatch ? jsonMatch[0] : qaContent;
       finalJson = JSON.parse(jsonStr);
    } catch (e) {
       throw new Error("The AI did not output valid JSON format. Try again.");
    }

    try {
      const { error: dbError } = await supabase
        .from('qna_sessions')
        .insert([{ video_url: url, qa_data: finalJson.qa }]);

      if (dbError) {
        console.error('Failed to save to Supabase:', dbError);
      }
    } catch (dbEx) {
      console.error('Supabase exception:', dbEx);
    }

    return NextResponse.json(finalJson);
  } catch (error: any) {
    console.error('Fallback Transcribe API Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during transcription processing' }, { status: 500 });
  }
}
