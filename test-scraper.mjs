import { getSubtitles } from 'youtube-captions-scraper';

async function run() {
  try {
    const videoId = '2epCxCCstn0'; 
    console.log('Fetching captions using youtube-captions-scraper...');
    
    // Default language is 'en', but this video is Malayalam. Let's try to fetch it.
    const captions = await getSubtitles({
      videoID: videoId,
      lang: 'ml' // Try Malayalam first
    });
    
    console.log('Captions fetched! Length:', captions.length);
    console.log(captions.slice(0, 2));

  } catch (err) {
    console.error('Failed with lang ml, trying en...', err);
    try {
        const captions = await getSubtitles({
          videoID: '2epCxCCstn0',
          lang: 'en'
        });
        console.log('Captions fetched (en)! Length:', captions.length);
    } catch (err2) {
        console.error('Completely failed:', err2);
    }
  }
}

run();
