import { NextResponse } from 'next/server';
import translate from 'google-translate-api-x';
import Groq from 'groq-sdk';
import { supabase } from '@/lib/supabase';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const runtime = 'nodejs';
export const maxDuration = 60; // Should only take 10-20 seconds

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    let { transcriptText, url } = await req.json();
    console.log(`[GENERATE-QA] ▶ Started | transcript length: ${transcriptText?.length || 0} chars`);
    if (!transcriptText || !url) return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });

    const MAX_CHARS = 15000;
    if (transcriptText.length > MAX_CHARS) {
      transcriptText = transcriptText.substring(0, MAX_CHARS);
      console.log(`[GENERATE-QA] ⚠ Step 1: Truncated to ${MAX_CHARS} chars`);
    }

    // Step 2: Translate
    let finalTranscriptText = '';
    try {
      console.log(`[GENERATE-QA] → Step 2: Translating to English...`);
      const chunks = transcriptText.match(/.{1,4500}(\s|$)/g) || [transcriptText];
      const translatedChunks = await translate(chunks, { to: 'en' });
      
      if (Array.isArray(translatedChunks)) {
        finalTranscriptText = (translatedChunks as any[]).map(res => res.text).join(' ');
      } else {
        finalTranscriptText = (translatedChunks as any).text;
      }
      console.log(`[GENERATE-QA] ✓ Step 2: Translated | ${finalTranscriptText.length} chars (${Date.now() - startTime}ms)`);
    } catch (e: any) {
      console.log(`[GENERATE-QA] ⚠ Step 2: Translation FAILED: ${e.message} | Using raw text`);
      finalTranscriptText = transcriptText;
    }

    // Step 3: Generate Q&A
    console.log(`[GENERATE-QA] → Step 3: Generating Q&A via Groq LLaMA...`);
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert educational curriculum designer specifically teaching 10th standard (SSLC) students. Your task is to generate thoughtful, exam-focused Questions and Answers based on the core educational concepts in the provided video transcript. Create as many questions as necessary to cover all the important topics in the transcript (do not force a specific number, just cover the core material).\n\nCRITICAL INSTRUCTIONS:\n- The transcript is from a livestream. Completely IGNORE all conversational chatter, reading of live comments, teacher pauses, or off-topic remarks.\n- Focus ONLY on the core academic subject matter being taught.\n- Tailor the difficulty of the questions specifically to a 10th grade student\'s level.\n- Output ONLY valid JSON in the exact following format: {"qa": [{"question": "...", "answer": "..."}]}. Do not include markdown formatting, backticks, or any other text.'
        },
        {
          role: 'user',
          content: `Transcript: ${finalTranscriptText}`
        }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    console.log(`[GENERATE-QA] ✓ Step 3: LLaMA responded (${Date.now() - startTime}ms)`);

    // Step 4: Parse JSON
    const qaContent = completion.choices[0]?.message?.content;
    
    if (!qaContent) {
      throw new Error("No content received from AI.");
    }
    
    let finalJson;
    try {
       const jsonMatch = qaContent.match(/\{[\s\S]*\}/);
       const jsonStr = jsonMatch ? jsonMatch[0] : qaContent;
       finalJson = JSON.parse(jsonStr);
       console.log(`[GENERATE-QA] ✓ Step 4: JSON parsed | ${finalJson.qa?.length || 0} Q&As generated`);
    } catch (e) {
       console.log(`[GENERATE-QA] ✗ Step 4: JSON parse FAILED | Raw: ${qaContent.substring(0, 200)}`);
       throw new Error("The AI did not output valid JSON format. Try again.");
    }

    // Step 5: Save to Supabase
    try {
      console.log(`[GENERATE-QA] → Step 5: Saving to Supabase...`);
      const { error: dbError } = await supabase
        .from('qna_sessions')
        .insert([{ video_url: url, qa_data: finalJson.qa }]);

      if (dbError) {
        console.log(`[GENERATE-QA] ⚠ Step 5: Supabase FAILED: ${JSON.stringify(dbError)}`);
      } else {
        console.log(`[GENERATE-QA] ✓ Step 5: Saved to Supabase`);
      }
    } catch (dbEx: any) {
      console.log(`[GENERATE-QA] ⚠ Step 5: Supabase exception: ${dbEx.message}`);
    }

    console.log(`[GENERATE-QA] ✅ COMPLETE | Total time: ${Date.now() - startTime}ms`);
    return NextResponse.json(finalJson);
  } catch (error: any) {
    console.error(`[GENERATE-QA] ❌ FATAL: ${error.message} (${Date.now() - startTime}ms)`);
    return NextResponse.json({ error: error.message || 'An error occurred during generation' }, { status: 500 });
  }
}
