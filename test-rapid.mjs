async function run() {
  const url = 'https://youtube-mp4-mp3-downloader.p.rapidapi.com/api/v1/download?format=720&id=2epCxCCstn0&audioQuality=128&addInfo=false&allowExtendedDuration=false';
  const options = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'youtube-mp4-mp3-downloader.p.rapidapi.com',
      'x-rapidapi-key': 'a6a90e3a92msh7b4a34962a832bdp1bf940jsn747cd1a2bddf'
    }
  };

  try {
    console.log("Fetching RapidAPI...");
    const response = await fetch(url, options);
    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(error);
  }
}
run();
