// Example: Background service integration
// Process tours without blocking your main app

import { 
  makeHomeTour, 
  queueHomeTourGeneration, 
  getJobStatus, 
  getAllJobs 
} from '@your-scope/home-tour-maker';
import Redis from 'redis';

class HomeTourService {
  constructor() {
    this.redis = Redis.createClient();
    this.isProcessing = false;
  }

  // Add to your existing app's tour creation endpoint
  async createTour(userId, images, options) {
    const config = {
      images,
      ...options,
      output: {
        path: `./storage/tours/${userId}_${Date.now()}.mp4`,
        aspect: '16:9',
        resolution: '1080p',
        targetSeconds: options.targetSeconds || 90,
        fps: 24
      },
      veo: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
        location: 'us-central1',
        model: 'veo-3.0-generate-001',
        generateAudio: false
      }
    };

    // Queue the job
    const { jobId } = await queueHomeTourGeneration(config);
    
    // Store in your database
    await this.redis.set(`tour:${jobId}`, JSON.stringify({
      userId,
      jobId,
      status: 'queued',
      createdAt: new Date().toISOString()
    }));

    // Start monitoring if not already running
    if (!this.isProcessing) {
      this.startBackgroundProcessor();
    }

    return { jobId };
  }

  // Background processor (run this in a separate process/worker)
  async startBackgroundProcessor() {
    this.isProcessing = true;
    
    setInterval(async () => {
      const jobs = getAllJobs();
      
      for (const job of jobs) {
        const redisKey = `tour:${job.id}`;
        const tourData = await this.redis.get(redisKey);
        
        if (tourData) {
          const tour = JSON.parse(tourData);
          
          // Update status in your database
          if (job.status === 'completed' && tour.status !== 'completed') {
            tour.status = 'completed';
            tour.result = job.result;
            tour.completedAt = new Date().toISOString();
            
            await this.redis.set(redisKey, JSON.stringify(tour));
            
            // Notify user (webhook, email, etc.)
            await this.notifyUser(tour.userId, 'Tour completed!', job.result);
          } else if (job.status === 'failed') {
            tour.status = 'failed';
            tour.error = job.error;
            
            await this.redis.set(redisKey, JSON.stringify(tour));
            await this.notifyUser(tour.userId, 'Tour failed', { error: job.error });
          }
        }
      }
    }, 5000); // Check every 5 seconds
  }

  async notifyUser(userId, message, data) {
    // Send webhook, email, push notification, etc.
    console.log(`Notify user ${userId}: ${message}`, data);
    
    // Example webhook
    try {
      await fetch(`${process.env.WEBHOOK_URL}/user/${userId}/tour-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, data })
      });
    } catch (error) {
      console.error('Webhook failed:', error);
    }
  }

  // Get tour status for your app
  async getTourStatus(jobId) {
    const status = getJobStatus(jobId);
    const tourData = await this.redis.get(`tour:${jobId}`);
    
    return {
      ...status,
      ...(tourData ? JSON.parse(tourData) : {})
    };
  }
}

// Usage in your main app
const tourService = new HomeTourService();

// In your Express/Next.js route:
app.post('/tours', async (req, res) => {
  const { jobId } = await tourService.createTour(
    req.user.id, 
    req.body.images, 
    req.body.options
  );
  
  res.json({ jobId });
});

app.get('/tours/:jobId/status', async (req, res) => {
  const status = await tourService.getTourStatus(req.params.jobId);
  res.json(status);
});

console.log(`
🎯 Background Service Integration:

1. Your app creates tours instantly (no waiting)
2. Background processor handles the heavy work
3. Users get notified when complete
4. Scales to handle multiple concurrent tours

Benefits:
- Non-blocking user experience
- Scales horizontally (multiple workers)
- Persistent job tracking
- Error recovery
- User notifications
`);

