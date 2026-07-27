async function testQuality() {
  const url = 'https://youtube-mp4-mp3-downloader.p.rapidapi.com/api/v1/download?format=mp3&id=DwgRftudggI&audioQuality=64&addInfo=false&allowExtendedDuration=false';
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
testQuality();
