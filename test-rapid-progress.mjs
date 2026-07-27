async function testProgress() {
  const progressId = 'v2_stream_d8a905fdafad06b83e3f'; // The one we got earlier
  const url = `https://youtube-mp4-mp3-downloader.p.rapidapi.com/api/v1/progress?id=${progressId}`;
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-host': 'youtube-mp4-mp3-downloader.p.rapidapi.com',
      'x-rapidapi-key': 'a6a90e3a92msh7b4a34962a832bdp1bf940jsn747cd1a2bddf'
    }
  };

  try {
    const res = await fetch(url, options);
    const data = await res.json();
    console.log(data);
  } catch(e) {
    console.error(e);
  }
}
testProgress();
