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

      console.log('Chunking audio to bypass 25MB limit...');
      const fileBuffer = fs.readFileSync(filePath);
      const midpoint = Math.floor(fileBuffer.length / 2);
      
      const chunk1Path = filePath + '_1.mp3';
      const chunk2Path = filePath + '_2.mp3';
      
      fs.writeFileSync(chunk1Path, fileBuffer.slice(0, midpoint));
      fs.writeFileSync(chunk2Path, fileBuffer.slice(midpoint));
      
      console.log('Transcribing chunks in parallel using Whisper...');
      const [res1, res2] = await Promise.all([
        groq.audio.transcriptions.create({
          file: fs.createReadStream(chunk1Path),
          model: 'whisper-large-v3-turbo',
          response_format: 'text',
        }),
        groq.audio.transcriptions.create({
          file: fs.createReadStream(chunk2Path),
          model: 'whisper-large-v3-turbo',
          response_format: 'text',
        })
      ]);
      
      const text1 = typeof res1 === 'string' ? res1 : (res1 as any)?.text || '';
      const text2 = typeof res2 === 'string' ? res2 : (res2 as any)?.text || '';
      
      rawTranscriptText = text1 + ' ' + text2;
      
      try { 
        if (fs.existsSync(chunk1Path)) fs.unlinkSync(chunk1Path); 
        if (fs.existsSync(chunk2Path)) fs.unlinkSync(chunk2Path); 
      } catch (e) {}
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

    return NextResponse.json({ transcriptText: rawTranscriptText });
  } catch (error: any) {
    console.error('Fallback Transcribe API Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during transcription processing' }, { status: 500 });
  }
}
