#!/usr/bin/env node

// Configuration examples for different deployment scenarios

import { makeHomeTour } from '@your-scope/home-tour-maker';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Example 1: Basic configuration with environment variables
async function basicConfiguration() {
  console.log('📋 Basic Configuration Example\n');

  const config = {
    images: [
      { path: './photos/exterior.jpg', room: 'exterior' },
      { path: './photos/living.jpg', room: 'living' },
      { path: './photos/kitchen.jpg', room: 'kitchen' }
    ],
    
    output: {
      path: './output/tour.mp4',
      aspect: '16:9',
      resolution: '1080p',
      targetSeconds: 60,
      fps: 24
    },
    
    // Google Cloud configuration from environment
    veo: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT,         // Your project ID
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      model: process.env.VEO_MODEL || 'veo-3.0-generate-001',
      generateAudio: false,
      bucketName: process.env.GCS_BUCKET                   // Your bucket name
    }
  };

  console.log('Config:', {
    projectId: config.veo.projectId,
    bucket: config.veo.bucketName,
    model: config.veo.model
  });

  return config;
}

// Example 2: Production configuration with service account
async function productionConfiguration() {
  console.log('🏭 Production Configuration Example\n');

  const config = {
    images: [
      { path: './uploads/photo1.jpg' },
      { path: './uploads/photo2.jpg' }
    ],
    
    listing: {
      headline: "Beautiful 3BR Home",
      bullets: ["Updated kitchen", "Hardwood floors", "Private garden"],
      address: "123 Main St, City, State"
    },
    
    voiceover: {
      voice: 'en-US-Neural2-D',
      speed: 1.0
    },
    
    brand: {
      logoPath: './assets/company-logo.png',
      primaryHex: '#0F6CBD'
    },
    
    output: {
      path: `./generated-tours/${Date.now()}_tour.mp4`,
      aspect: '16:9',
      resolution: '1080p',
      targetSeconds: 90,
      fps: 24
    },
    
    veo: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      location: 'us-central1',
      model: 'veo-3.0-generate-001',
      generateAudio: false,
      bucketName: process.env.GCS_BUCKET
    },
    
    tmpDir: './temp/processing'
  };

  return config;
}

// Example 3: Multi-tenant SaaS configuration
async function saasConfiguration(tenantId, userId) {
  console.log(`🏢 SaaS Configuration for tenant: ${tenantId}\n`);

  // You might have different projects per tenant
  const tenantConfig = {
    'tenant1': {
      projectId: 'tenant1-home-tours',
      bucket: 'tenant1-tours-bucket'
    },
    'tenant2': {
      projectId: 'tenant2-home-tours', 
      bucket: 'tenant2-tours-bucket'
    },
    'default': {
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      bucket: process.env.GCS_BUCKET
    }
  };

  const tenant = tenantConfig[tenantId] || tenantConfig['default'];

  const config = {
    images: [], // Populated from user uploads
    
    output: {
      path: `./tours/${tenantId}/${userId}/${Date.now()}.mp4`,
      aspect: '16:9',
      resolution: '1080p', 
      targetSeconds: 90,
      fps: 24
    },
    
    veo: {
      projectId: tenant.projectId,
      location: 'us-central1',
      model: 'veo-3.0-generate-001',
      generateAudio: false,
      bucketName: tenant.bucket
    },
    
    tmpDir: `./temp/${tenantId}/${userId}`
  };

  return config;
}

// Example 4: Development vs Production environments
function getEnvironmentConfig() {
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    return {
      projectId: 'dev-home-tours',
      bucket: 'dev-tours-bucket',
      model: 'veo-2.0-generate-001', // Cheaper for testing
      location: 'us-central1'
    };
  } else {
    return {
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      bucket: process.env.GCS_BUCKET,
      model: 'veo-3.0-generate-001', // Latest for production
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
    };
  }
}

// Example 5: Cost optimization configuration
async function costOptimizedConfiguration() {
  console.log('💰 Cost-Optimized Configuration\n');

  const config = {
    images: [], // Your images
    
    output: {
      path: './tour.mp4',
      aspect: '16:9',
      resolution: '720p',        // Lower resolution = lower cost
      targetSeconds: 60,         // Shorter videos = lower cost
      fps: 24
    },
    
    veo: {
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      location: 'us-central1',
      model: 'veo-2.0-generate-001',  // Older model = lower cost
      generateAudio: false,
      bucketName: process.env.GCS_BUCKET
    }
  };

  return config;
}

// Example usage in your app
async function integrateWithYourApp() {
  console.log('🔗 Integration Example\n');

  try {
    // Check required environment variables
    const required = ['GOOGLE_CLOUD_PROJECT', 'GCS_BUCKET'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error('❌ Missing required environment variables:', missing);
      console.log('Create .env file with:');
      missing.forEach(key => console.log(`${key}=your-value`));
      return;
    }

    // Get configuration
    const config = await basicConfiguration();
    
    // Validate configuration
    console.log('✅ Configuration valid');
    console.log(`   Project: ${config.veo.projectId}`);
    console.log(`   Bucket: ${config.veo.bucketName}`);
    console.log(`   Model: ${config.veo.model}`);
    
    // Test with dry run (doesn't generate, just validates)
    console.log('\n🧪 Testing configuration...');
    // const result = await makeHomeTour(config, (phase, progress, message) => {
    //   console.log(`${phase}: ${progress}% - ${message}`);
    // });
    
    console.log('✅ Ready to generate tours!');

  } catch (error) {
    console.error('❌ Configuration error:', error.message);
    console.log('\n💡 Common fixes:');
    console.log('   - Run: gcloud auth application-default login');
    console.log('   - Check project ID in .env file');
    console.log('   - Verify APIs are enabled');
    console.log('   - Ensure bucket exists');
  }
}

// Run example
integrateWithYourApp();

// Export configurations for use in other files
export {
  basicConfiguration,
  productionConfiguration,
  saasConfiguration,
  getEnvironmentConfig,
  costOptimizedConfiguration
};

