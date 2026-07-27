async function testPiped() {
  const videoId = '2epCxCCstn0';
  const url = `https://pipedapi.kavin.rocks/streams/${videoId}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    if (data.subtitles && data.subtitles.length > 0) {
      console.log('Found subtitles!');
      console.log('Available langs:', data.subtitles.map(s => s.code));
      
      // Try to fetch the actual subtitle content
      const subUrl = data.subtitles[0].url;
      const subRes = await fetch(subUrl);
      const subText = await subRes.text();
      console.log('Subtitle length:', subText.length);
      console.log(subText.substring(0, 200));
    } else {
      console.log('No subtitles found in Piped response.');
    }
  } catch (err) {
    console.error('Error fetching from Piped:', err);
  }
}

testPiped();
