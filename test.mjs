import { Innertube } from 'youtubei.js';
import fs from 'fs';

async function run() {
  try {
    const yt = await Innertube.create();
    // Test a normal VOD video (not a livestream)
    console.log("Testing normal video...");
    const stream = await yt.download('jNQXAC9IVRw', {
      type: 'audio',
      quality: 'bestefficiency',
      format: 'mp4'
    });
    console.log("Stream acquired successfully for normal video!");
  } catch (e) {
    console.error("Error for normal video:", e);
  }

  try {
    const yt = await Innertube.create();
    // Test the user's livestream video
    console.log("Testing livestream video...");
    const stream = await yt.download('2epCxCCstn0', {
      type: 'audio',
      quality: 'bestefficiency',
      format: 'mp4'
    });
    console.log("Stream acquired successfully for livestream!");
  } catch (e) {
    console.error("Error for livestream video:", e);
  }
}

run();
