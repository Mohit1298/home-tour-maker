// Example: Simplest possible integration
// Just import and use the functions directly!

import { makeHomeTour, validateHomeTourConfig } from '@your-scope/home-tour-maker';

// In your existing application code
class RealEstateApp {
  async generatePropertyTour(propertyId, imageFiles, listingData) {
    try {
      // 1. Validate first (optional but recommended)
      const images = imageFiles.map(file => ({ path: file.path }));
      const validation = await validateHomeTourConfig(images, 90);
      
      console.log(`Estimated cost: $${validation.summary.estimatedCost}`);
      console.log(`Will use ${validation.summary.estimatedVeoSegments} Veo segments`);
      
      if (validation.warnings.length > 0) {
        console.warn('Warnings:', validation.warnings);
      }

      // 2. Generate the tour
      const result = await makeHomeTour({
        images,
        listing: listingData,
        voiceover: {
          voice: 'en-US-Neural2-D',
          speed: 1.0
        },
        output: {
          path: `./property_tours/${propertyId}.mp4`,
          aspect: '16:9',
          resolution: '1080p',
          targetSeconds: 90,
          fps: 24
        },
        veo: {
          projectId: process.env.GOOGLE_CLOUD_PROJECT,
          location: 'us-central1',
          model: 'veo-3.0-generate-001',
          generateAudio: false
        }
      });

      // 3. Save to your database
      await this.database.properties.update(propertyId, {
        tourVideoPath: result.outputPath,
        tourDuration: result.duration,
        tourGeneratedAt: new Date(),
        tourCost: result.estimatedCost
      });

      return {
        success: true,
        videoPath: result.outputPath,
        duration: result.duration,
        cost: result.estimatedCost
      };

    } catch (error) {
      console.error('Tour generation failed:', error);
      throw error;
    }
  }

  // Use in your existing workflows
  async onPropertyPhotosUploaded(propertyId, photos) {
    // Auto-generate tour when photos are uploaded
    const property = await this.database.properties.get(propertyId);
    
    try {
      const result = await this.generatePropertyTour(
        propertyId, 
        photos, 
        {
          headline: property.title,
          bullets: property.features,
          address: property.address
        }
      );
      
      // Notify property owner
      await this.notifications.send(property.ownerId, {
        title: 'Your property tour is ready!',
        message: `Generated ${result.duration}s tour for ${property.title}`,
        videoUrl: result.videoPath
      });
      
    } catch (error) {
      // Handle error gracefully
      await this.notifications.send(property.ownerId, {
        title: 'Tour generation failed',
        message: 'Please contact support',
        error: error.message
      });
    }
  }

  // Batch processing
  async generateToursForAllProperties() {
    const properties = await this.database.properties.findWithoutTours();
    
    for (const property of properties) {
      if (property.photos.length >= 6) {
        await this.generatePropertyTour(
          property.id,
          property.photos,
          {
            headline: property.title,
            bullets: property.features,
            address: property.address
          }
        );
        
        // Wait between generations to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30s delay
      }
    }
  }
}

// Usage
const app = new RealEstateApp();

// When photos are uploaded in your existing flow:
app.onPropertyPhotosUploaded('prop_123', uploadedFiles);

// Or manual generation:
const result = await app.generatePropertyTour('prop_123', photos, listing);

console.log(`
🎯 Simple Integration Benefits:

✅ No separate server needed
✅ Integrates into your existing code
✅ Works with any Node.js framework
✅ Synchronous or asynchronous
✅ Error handling in your flow
✅ Database integration as needed

Perfect for:
- Adding tours to existing real estate apps
- Automated processing pipelines  
- Custom business workflows
- Internal tools
`);

