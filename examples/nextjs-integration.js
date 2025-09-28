// Example: pages/api/tours/generate.js (Next.js API route)
// No separate server - integrates into your Next.js app!

import { makeHomeTour, queueHomeTourGeneration } from '@your-scope/home-tour-maker';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse uploaded files
    const form = formidable({});
    const [fields, files] = await form.parse(req);

    const images = Array.isArray(files.images) 
      ? files.images.map(file => ({ path: file.filepath }))
      : [{ path: files.images.filepath }];

    const config = {
      images,
      listing: fields.listing ? JSON.parse(fields.listing[0]) : undefined,
      output: {
        path: `./public/tours/${Date.now()}.mp4`,
        aspect: '16:9',
        resolution: '1080p',
        targetSeconds: parseInt(fields.targetSeconds?.[0]) || 90,
        fps: 24
      },
      veo: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
        location: 'us-central1',
        model: 'veo-3.0-generate-001',
        generateAudio: false
      }
    };

    // For Next.js, usually better to use async jobs
    const { jobId } = await queueHomeTourGeneration(config);
    
    res.json({ 
      success: true, 
      jobId,
      checkStatusUrl: `/api/tours/status/${jobId}`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// pages/api/tours/status/[jobId].js
export function statusHandler(req, res) {
  const { jobId } = req.query;
  const status = getJobStatus(jobId);
  
  if (!status) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(status);
}

console.log(`
🎯 Next.js Integration:

1. Add to your Next.js app:
   pages/api/tours/generate.js
   pages/api/tours/status/[jobId].js

2. Frontend usage:
   const response = await fetch('/api/tours/generate', {
     method: 'POST',
     body: formData
   });
   
   const { jobId } = await response.json();
   
   // Poll for status
   const status = await fetch(\`/api/tours/status/\${jobId}\`);
`);

