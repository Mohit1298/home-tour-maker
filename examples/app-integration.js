#!/usr/bin/env node

// Example: Integrating into your existing Express.js app
// No separate server needed!

import express from 'express';
import multer from 'multer';
import { 
  makeHomeTour,
  validateHomeTourConfig,
  getAvailableVoices,
  queueHomeTourGeneration,
  getJobStatus,
  getAllJobs
} from '@your-scope/home-tour-maker';

// Your existing app
const app = express();
const upload = multer({ dest: './uploads/' });

// Add home tour functionality to YOUR app
app.post('/my-app/create-tour', upload.array('images'), async (req, res) => {
  try {
    // Direct integration - no external server needed!
    const config = {
      images: req.files.map(file => ({ path: file.path })),
      listing: req.body.listing ? JSON.parse(req.body.listing) : undefined,
      voiceover: req.body.voiceover ? JSON.parse(req.body.voiceover) : undefined,
      output: {
        path: `./tours/${req.user.id}_${Date.now()}.mp4`,
        aspect: '16:9',
        resolution: '1080p',
        targetSeconds: parseInt(req.body.targetSeconds) || 90,
        fps: 24
      },
      veo: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
        location: 'us-central1',
        model: 'veo-3.0-generate-001',
        generateAudio: false
      }
    };

    // Option A: Direct synchronous generation
    if (req.body.sync === 'true') {
      const result = await makeHomeTour(config);
      res.json({ 
        success: true, 
        videoPath: result.outputPath,
        duration: result.duration,
        cost: result.estimatedCost
      });
    } 
    // Option B: Async job queue
    else {
      const { jobId } = await queueHomeTourGeneration(config);
      res.json({ success: true, jobId, status: 'queued' });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check job status
app.get('/my-app/tours/status/:jobId', (req, res) => {
  const status = getJobStatus(req.params.jobId);
  res.json(status || { error: 'Job not found' });
});

// Validate before generation
app.post('/my-app/tours/validate', upload.array('images'), async (req, res) => {
  try {
    const images = req.files.map(file => ({ path: file.path }));
    const validation = await validateHomeTourConfig(images, 90);
    res.json(validation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Your app runs on your port
app.listen(3000, () => {
  console.log('My app with integrated home tours running on port 3000');
});

console.log(`
🎯 Integration Examples:

1. Direct sync generation:
   POST /my-app/create-tour (with sync=true)

2. Async job queue:
   POST /my-app/create-tour
   GET /my-app/tours/status/job_123

3. Validation:
   POST /my-app/tours/validate
`);

