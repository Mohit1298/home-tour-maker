const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

async function testKenBurns() {
  const imagePath = 'test-photos/7e5f5_1.jpg';
  const outputPath = 'debug-output.mp4';
  const duration = 2;
  const filter = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
  
  console.log('Testing Ken Burns with:');
  console.log('- Image:', imagePath);
  console.log('- Duration:', duration);
  console.log('- Filter:', filter);
  
  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .inputOptions([
        '-loop 1',
        `-t ${duration}`
      ])
      .outputOptions([
        `-vf ${filter}`,
        `-r 24`,
        `-c:v libx264`,
        `-crf 23`,
        `-preset medium`,
        '-pix_fmt yuv420p',
        '-movflags +faststart'
      ])
      .on('start', (cmd) => {
        console.log('Starting FFmpeg with command:');
        console.log(cmd);
      })
      .on('progress', (progress) => {
        console.log('Progress:', progress.percent || 0);
      })
      .on('end', () => {
        console.log('Success!');
        resolve(outputPath);
      })
      .on('error', (error) => {
        console.error('Error:', error);
        reject(error);
      })
      .save(outputPath);
  });
}

testKenBurns().catch(console.error);

