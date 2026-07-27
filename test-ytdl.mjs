import ytdl from '@distube/ytdl-core';
import fs from 'fs';

async function run() {
  try {
    const videoId = '2epCxCCstn0'; 
    console.log('Fetching info using ytdl-core...');
    
    const info = await ytdl.getInfo(videoId);
    console.log('Title:', info.videoDetails.title);
    
    console.log('Downloading audio...');
    const stream = ytdl.downloadFromInfo(info, { quality: 'lowestaudio', filter: 'audioonly' });
    const writeStream = fs.createWriteStream('test-audio.mp4');
    
    stream.pipe(writeStream);
    
    stream.on('end', () => {
        console.log('Download complete!');
    });
    
    stream.on('error', (err) => {
        console.error('Download error:', err);
    });

  } catch (err) {
    console.error('Failed:', err);
  }
}

run();
