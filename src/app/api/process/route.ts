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
  try {
    const { url } = await req.json();

    // Validate URL (basic extraction)
    let videoId = '';
    try {
      const parsedUrl = new URL(url);
      videoId = parsedUrl.searchParams.get('v') || parsedUrl.pathname.split('/').pop() || '';
    } catch {
      videoId = url.split('/').pop() || '';
    }
    
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    // Fetch Transcript directly (Bypasses YouTube blocking audio downloads and is 100x faster)
    let rawTranscriptText = '';
    try {
      const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
      rawTranscriptText = transcriptArray.map(t => t.text).join(' ');
    } catch (e) {
      console.error('Transcript fetch failed. Attempting Whisper fallback...', e);
      
      // Fallback: Download audio and transcribe using Whisper
      const tmpDir = os.tmpdir();
      const fileName = `audio-${Date.now()}.mp4`;
      const filePath = path.join(tmpDir, fileName);

      try {
        const yt = await Innertube.create();
        const stream = await yt.download(videoId, {
          type: 'audio',
          quality: 'bestefficiency',
          format: 'mp4'
        });

        const writeStream = fs.createWriteStream(filePath);
        const reader = stream.getReader();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            writeStream.write(Buffer.from(value));
          }
        }
        writeStream.end();

        // Wait for file to finish writing
        await new Promise<void>((resolve) => writeStream.on('finish', () => resolve()));

        // Transcribe Audio using Whisper
        const transcriptionResponse: any = await groq.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: 'whisper-large-v3-turbo',
          response_format: 'text',
        });

        rawTranscriptText = typeof transcriptionResponse === 'string' ? transcriptionResponse : transcriptionResponse?.text;
      } catch (fallbackError) {
        console.error('Whisper fallback also failed:', fallbackError);
        throw new Error('Could not fetch transcript or download audio. Please ensure the video has closed captions (CC) enabled, or try another video.');
      } finally {
        // Clean up temp file
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (cleanupErr) {
          console.error('Failed to delete temp audio file:', cleanupErr);
        }
      }
    }

    if (!rawTranscriptText || rawTranscriptText.trim().length === 0) {
        throw new Error("Transcription failed or returned empty text.");
    }

    // Limit the transcript to the first 15,000 characters
    const MAX_CHARS = 15000;
    if (rawTranscriptText.length > MAX_CHARS) {
      rawTranscriptText = rawTranscriptText.substring(0, MAX_CHARS);
    }

    // Translate transcript to English using free Google Translate API
    let transcriptText = '';
    try {
      // Split into 4500 char chunks to respect Google API limits
      const chunks = rawTranscriptText.match(/.{1,4500}(\s|$)/g) || [rawTranscriptText];
      const translatedChunks = await translate(chunks, { to: 'en' });
      
      if (Array.isArray(translatedChunks)) {
        transcriptText = (translatedChunks as any[]).map(res => res.text).join(' ');
      } else {
        transcriptText = (translatedChunks as any).text;
      }
    } catch (e) {
      console.error('Translation failed, falling back to raw transcript:', e);
      transcriptText = rawTranscriptText;
    }

    // 3. Generate Q&A using LLaMA
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

    // 4. Parse the output and save to Supabase
    const qaContent = completion.choices[0]?.message?.content;
    
    if (!qaContent) {
      throw new Error("No content received from AI.");
    }
    
    // Attempt to extract json if model wrapped it in markdown or something
    let finalJson;
    try {
       const jsonMatch = qaContent.match(/\{[\s\S]*\}/);
       const jsonStr = jsonMatch ? jsonMatch[0] : qaContent;
       finalJson = JSON.parse(jsonStr);
    } catch (e) {
       console.error("Failed to parse JSON from AI output", qaContent);
       throw new Error("The AI did not output valid JSON format. Try again.");
    }

    // Save to Supabase
    try {
      const { error: dbError } = await supabase
        .from('qna_sessions')
        .insert([{ video_url: url, qa_data: finalJson.qa }]);

      if (dbError) {
        console.error('Failed to save to Supabase:', dbError);
        // We do not throw here, as we still want to return the Q&A to the user even if DB fails
      }
    } catch (dbEx) {
      console.error('Supabase exception:', dbEx);
    }

    return NextResponse.json(finalJson);
  } catch (error: any) {
    console.error('Process API Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during processing' }, { status: 500 });
  }
}
