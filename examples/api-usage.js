#!/usr/bin/env node

// Example showing how to use the API functions directly
// This demonstrates integration into your own Node.js application

import { 
  makeHomeTour,
  validateHomeTourConfig,
  getAvailableVoices,
  queueHomeTourGeneration,
  getJobStatus,
  getAllJobs,
  cancelJob
} from '../dist/index.js';

async function directApiExample() {
  console.log('🔧 Direct API Integration Example\n');

  const images = [
    { path: './examples/photos/exterior.jpg', room: 'exterior' },
    { path: './examples/photos/living.jpg', room: 'living' },
    { path: './examples/photos/kitchen.jpg', room: 'kitchen' },
    { path: './examples/photos/bedroom.jpg', room: 'bedroom' },
    { path: './examples/photos/bathroom.jpg', room: 'bathroom' },
    { path: './examples/photos/backyard.jpg', room: 'backyard' }
  ];

  try {
    // 1. Validate configuration first
    console.log('1️⃣ Validating configuration...');
    const validation = await validateHomeTourConfig(images, 90);
    
    console.log('✅ Validation result:');
    console.log(`   Images: ${validation.summary.imageCount}`);
    console.log(`   Estimated cost: $${validation.summary.estimatedCost.toFixed(2)}`);
    console.log(`   Veo segments: ${validation.summary.estimatedVeoSegments}`);
    console.log(`   Ken Burns segments: ${validation.summary.estimatedKenBurnsSegments}`);
    
    if (validation.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      validation.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    // 2. Get available voices
    console.log('\n2️⃣ Getting available voices...');
    const voicesResult = await getAvailableVoices('en-US');
    console.log(`✅ Found ${voicesResult.voices.length} voices for ${voicesResult.languageCode}`);
    
    // Show Neural voices
    const neuralVoices = voicesResult.voices.filter(v => v.type === 'Neural');
    console.log('🎙️  Neural voices:');
    neuralVoices.forEach(voice => console.log(`   - ${voice.name} (${voice.gender})`));

    // 3. Queue async job
    console.log('\n3️⃣ Queueing async generation job...');
    
    const config = {
      images,
      listing: {
        headline: "Beautiful 3BR Home",
        bullets: ["Updated kitchen", "Spacious rooms", "Private backyard"]
      },
      voiceover: {
        voice: 'en-US-Neural2-D',
        speed: 1.0
      },
      output: {
        path: './output/api-example-tour.mp4',
        aspect: '16:9',
        resolution: '1080p',
        targetSeconds: 60,
        fps: 24
      },
      veo: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id',
        location: 'us-central1',
        model: 'veo-3.0-generate-001',
        generateAudio: false
      },
      tmpDir: './.cache/api-example'
    };

    const { jobId, status } = await queueHomeTourGeneration(config);
    console.log(`✅ Job queued: ${jobId}`);
    console.log(`   Status: ${status.status}`);
    console.log(`   Phase: ${status.phase}`);

    // 4. Monitor job progress
    console.log('\n4️⃣ Monitoring job progress...');
    
    let jobComplete = false;
    while (!jobComplete) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const currentStatus = getJobStatus(jobId);
      if (currentStatus) {
        console.log(`📊 Progress: ${currentStatus.progress.toFixed(1)}% - ${currentStatus.phase}`);
        if (currentStatus.message) {
          console.log(`   Message: ${currentStatus.message}`);
        }
        if (currentStatus.estimatedTimeRemaining) {
          console.log(`   ETA: ${currentStatus.estimatedTimeRemaining}s remaining`);
        }

        if (currentStatus.status === 'completed') {
          console.log('🎉 Job completed successfully!');
          console.log(`   Output: ${currentStatus.result?.outputPath}`);
          console.log(`   Duration: ${currentStatus.result?.duration.toFixed(1)}s`);
          console.log(`   Cost: $${currentStatus.result?.estimatedCost.toFixed(2)}`);
          jobComplete = true;
        } else if (currentStatus.status === 'failed') {
          console.log(`❌ Job failed: ${currentStatus.error}`);
          jobComplete = true;
        }
      } else {
        console.log('❌ Job not found');
        jobComplete = true;
      }
    }

    // 5. Show all jobs
    console.log('\n5️⃣ All jobs summary:');
    const allJobs = getAllJobs();
    allJobs.forEach(job => {
      console.log(`   ${job.id}: ${job.status} (${job.progress.toFixed(1)}%)`);
    });

  } catch (error) {
    console.error('❌ API example failed:', error.message);
  }
}

async function webAppIntegrationExample() {
  console.log('\n🌐 Web App Integration Example\n');
  
  // This shows how you might integrate into an Express.js app
  console.log('Example Express.js route handlers:');
  
  console.log(`
// POST /api/home-tours/validate
app.post('/api/home-tours/validate', upload.array('images'), async (req, res) => {
  try {
    const images = req.files.map(file => ({ path: file.path }));
    const targetSeconds = parseInt(req.body.targetSeconds) || 90;
    
    const validation = await validateHomeTourConfig(images, targetSeconds);
    res.json(validation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/home-tours/generate
app.post('/api/home-tours/generate', upload.array('images'), async (req, res) => {
  try {
    const config = buildConfigFromRequest(req); // Your config builder
    const { jobId, status } = await queueHomeTourGeneration(config);
    res.json({ jobId, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/home-tours/jobs/:jobId
app.get('/api/home-tours/jobs/:jobId', (req, res) => {
  const status = getJobStatus(req.params.jobId);
  if (!status) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(status);
});
`);
}

async function backgroundServiceExample() {
  console.log('\n🔄 Background Service Example\n');
  
  console.log('Example background processor:');
  
  console.log(`
import { queueHomeTourGeneration, getJobStatus } from '@your-scope/home-tour-maker';
import { sendWebhook, notifyUser } from './notifications.js';

class HomeTourService {
  async processUpload(userId, images, options) {
    // Queue the job
    const { jobId } = await queueHomeTourGeneration({
      images,
      ...options
    });
    
    // Store job ID with user
    await this.db.jobs.create({ userId, jobId, status: 'pending' });
    
    // Start monitoring
    this.monitorJob(jobId, userId);
    
    return { jobId };
  }
  
  async monitorJob(jobId, userId) {
    const checkProgress = setInterval(async () => {
      const status = getJobStatus(jobId);
      
      if (status?.status === 'completed') {
        clearInterval(checkProgress);
        await notifyUser(userId, 'Tour ready!', status.result);
        await sendWebhook(userId, 'tour.completed', status.result);
      } else if (status?.status === 'failed') {
        clearInterval(checkProgress);
        await notifyUser(userId, 'Tour failed', { error: status.error });
      }
    }, 5000);
  }
}
`);
}

// Run examples
if (process.env.EXAMPLE_MODE === 'direct') {
  directApiExample();
} else if (process.env.EXAMPLE_MODE === 'webapp') {
  webAppIntegrationExample();
} else if (process.env.EXAMPLE_MODE === 'service') {
  backgroundServiceExample();
} else {
  console.log('🔧 Home Tour Maker - API Integration Examples\n');
  console.log('Set EXAMPLE_MODE environment variable to run specific examples:');
  console.log('  EXAMPLE_MODE=direct   - Direct API function usage');
  console.log('  EXAMPLE_MODE=webapp   - Web app integration patterns');
  console.log('  EXAMPLE_MODE=service  - Background service patterns');
  console.log('\nOr run the built-in HTTP server:');
  console.log('  npx home-tour-maker serve --port 3000 --cors');
}
