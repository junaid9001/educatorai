import fs from 'fs';

async function testApi() {
  const rapidApiHost = 'youtube-mp36.p.rapidapi.com';
  const rapidApiKey = 'a6a90e3a92msh7b4a34962a832bdp1bf940jsn747cd1a2bddf';
  const videoId = 'UxxajLWwzqY'; // Khan academy video

  const downloadUrlApi = `https://${rapidApiHost}/dl?id=${videoId}`;
  console.log(`Calling: ${downloadUrlApi}`);
  
  const res = await fetch(downloadUrlApi, {
    headers: {
      'x-rapidapi-host': rapidApiHost,
      'x-rapidapi-key': rapidApiKey
    }
  });
  
  const data = await res.json();
  console.log(data);
}

testApi();
