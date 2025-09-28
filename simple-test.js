const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

async function createSimpleVideo() {
  const imageFiles = [
    'test-photos/7e5f5_1.jpg',
    'test-photos/7e5f5_2.jpg', 
    'test-photos/7e5f5_3.jpg'
  ];
  
  const outputPath = 'simple-tour.mp4';
  
  console.log('Creating simple video from Ken Burns clips...');
  
  // First, create Ken Burns clips for each image
  const clips = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const clipPath = `temp_clip_${i}.mp4`;
    
    await new Promise((resolve, reject) => {
      ffmpeg(imageFiles[i])
        .inputOptions(['-loop 1', '-t 3'])
        .outputOptions([
          '-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
          '-r 24',
          '-c:v libx264',
          '-crf 23',
          '-preset medium',
          '-pix_fmt yuv420p'
        ])
        .on('end', () => {
          console.log(`Created clip ${i + 1}/${imageFiles.length}`);
          clips.push(clipPath);
          resolve();
        })
        .on('error', reject)
        .save(clipPath);
    });
  }
  
  // Concatenate clips
  console.log('Concatenating clips...');
  const command = ffmpeg();
  clips.forEach(clip => command.input(clip));
  
  await new Promise((resolve, reject) => {
    command
      .on('end', () => {
        console.log('Video created successfully!');
        resolve();
      })
      .on('error', reject)
      .mergeToFile(outputPath);
  });
  
  // Cleanup
  clips.forEach(clip => {
    if (fs.existsSync(clip)) fs.unlinkSync(clip);
  });
  
  console.log(`Simple tour video created: ${outputPath}`);
}

createSimpleVideo().catch(console.error);

