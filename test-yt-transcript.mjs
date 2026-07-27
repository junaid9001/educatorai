import { Innertube } from 'youtubei.js';

async function run() {
  try {
    const yt = await Innertube.create();
    const videoId = '2epCxCCstn0'; // The long Malayalam livestream video
    console.log('Fetching info for', videoId);
    
    const info = await yt.getInfo(videoId);
    console.log('Info fetched. Getting transcript...');
    
    const transcriptData = await info.getTranscript();
    console.log('Transcript fetched successfully!');
    
    if (transcriptData && transcriptData.transcript) {
        console.log('Transcript length:', JSON.stringify(transcriptData.transcript).length);
    } else {
        console.log('No transcript object found inside data');
    }
    
  } catch (err) {
    console.error('Failed:', err);
  }
}

run();
