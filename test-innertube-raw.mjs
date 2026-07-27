async function fetchCaptions(videoId) {
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' // or android
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20210721.00.00'
          }
        },
        videoId: videoId
      })
    });

    const data = await response.json();
    
    if (data.captions) {
      console.log('Captions found via Android spoofing!');
      const tracks = data.captions.playerCaptionsTracklistRenderer.captionTracks;
      console.log('Tracks:', tracks.map(t => t.name.runs[0].text));
      
      const subUrl = tracks[0].baseUrl;
      const subRes = await fetch(subUrl);
      const subText = await subRes.text();
      console.log('Subtitle XML length:', subText.length);
      console.log(subText.substring(0, 100));
    } else {
      console.log('No captions found in response.', data?.playabilityStatus?.status);
    }

  } catch (err) {
    console.error(err);
  }
}

fetchCaptions('2epCxCCstn0');
