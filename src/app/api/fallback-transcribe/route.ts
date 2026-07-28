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
  const startTime = Date.now();
  try {
    const { downloadUrl, url } = await req.json();
    console.log(`[FALLBACK-TRANSCRIBE] ▶ Started | downloadUrl: ${downloadUrl?.substring(0, 80)}...`);
    if (!downloadUrl || !url) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });

    const tmpDir = os.tmpdir();
    const fileName = `audio-${Date.now()}.mp3`;
    const filePath = path.join(tmpDir, fileName);

    let rawTranscriptText = '';

    try {
      // Step 1: Download audio
      console.log(`[FALLBACK-TRANSCRIBE] → Step 1: Downloading audio from proxy...`);
      let audioRes = await fetch(downloadUrl);
      
      // Retry loop for CDN sync delays (sometimes cheap APIs return link before file is fully written)
      let attempts = 1;
      while (!audioRes.ok && audioRes.status === 404 && attempts <= 3) {
        console.log(`[FALLBACK-TRANSCRIBE] ⚠ Step 1: 404 Not Found. Retrying in 3 seconds (Attempt ${attempts}/3)...`);
        await new Promise(r => setTimeout(r, 3000));
        audioRes = await fetch(downloadUrl);
        attempts++;
      }

      if (!audioRes.ok) {
        console.log(`[FALLBACK-TRANSCRIBE] ✗ Step 1: Download failed | HTTP ${audioRes.status} ${audioRes.statusText}`);
        throw new Error(`Failed to download audio file from proxy (HTTP ${audioRes.status})`);
      }

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
      
      const fileSizeBytes = fs.statSync(filePath).size;
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
      console.log(`[FALLBACK-TRANSCRIBE] ✓ Step 1: Downloaded | ${fileSizeMB} MB (${Date.now() - startTime}ms)`);

      // Step 2: Chunk audio
      console.log(`[FALLBACK-TRANSCRIBE] → Step 2: Chunking audio to bypass 25MB limit...`);
      const fileBuffer = fs.readFileSync(filePath);
      const midpoint = Math.floor(fileBuffer.length / 2);
      
      const chunk1Path = filePath + '_1.mp3';
      const chunk2Path = filePath + '_2.mp3';
      
      fs.writeFileSync(chunk1Path, fileBuffer.slice(0, midpoint));
      fs.writeFileSync(chunk2Path, fileBuffer.slice(midpoint));
      
      const chunk1MB = (midpoint / (1024 * 1024)).toFixed(2);
      const chunk2MB = ((fileBuffer.length - midpoint) / (1024 * 1024)).toFixed(2);
      console.log(`[FALLBACK-TRANSCRIBE] ✓ Step 2: Chunked | Chunk1: ${chunk1MB} MB, Chunk2: ${chunk2MB} MB`);
      
      // Step 3: Transcribe in parallel
      console.log(`[FALLBACK-TRANSCRIBE] → Step 3: Transcribing both chunks via Whisper (parallel)...`);
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
      console.log(`[FALLBACK-TRANSCRIBE] ✓ Step 3: Transcribed | ${rawTranscriptText.length} chars (${Date.now() - startTime}ms)`);
      
      try { 
        if (fs.existsSync(chunk1Path)) fs.unlinkSync(chunk1Path); 
        if (fs.existsSync(chunk2Path)) fs.unlinkSync(chunk2Path); 
      } catch (e) {}
    } catch (fallbackError: any) {
      console.error(`[FALLBACK-TRANSCRIBE] ✗ FAILED: ${fallbackError.message} (${Date.now() - startTime}ms)`);
      throw new Error('Could not download proxy audio or transcribe using Whisper: ' + fallbackError.message);
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (cleanupErr) {
        console.error('[FALLBACK-TRANSCRIBE] ⚠ Failed to delete temp audio file:', cleanupErr);
      }
    }

    if (!rawTranscriptText || rawTranscriptText.trim().length === 0) {
      console.log(`[FALLBACK-TRANSCRIBE] ✗ Transcription returned empty text`);
      throw new Error("Transcription failed or returned empty text.");
    }

    console.log(`[FALLBACK-TRANSCRIBE] ✅ COMPLETE | ${rawTranscriptText.length} chars returned (${Date.now() - startTime}ms)`);
    return NextResponse.json({ transcriptText: rawTranscriptText });
  } catch (error: any) {
    console.error(`[FALLBACK-TRANSCRIBE] ❌ FATAL: ${error.message} (${Date.now() - startTime}ms)`);
    return NextResponse.json({ error: error.message || 'An error occurred during transcription processing' }, { status: 500 });
  }
}
