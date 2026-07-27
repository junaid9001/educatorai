import { YoutubeTranscript } from 'youtube-transcript';

async function run() {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript('2epCxCCstn0', { lang: 'en' });
    console.log("Success! Transcript length:", transcript.length);
    console.log("First line:", transcript[0].text);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
