#!/usr/bin/env node

// Basic usage example for @your-scope/home-tour-maker
// Run with: node examples/basic-usage.js

import { makeHomeTour } from '../dist/index.js';
import path from 'path';

async function basicExample() {
  try {
    console.log('🎬 Starting basic home tour generation...');

    const result = await makeHomeTour({
      images: [
        { path: './examples/photos/exterior.jpg', room: 'exterior' },
        { path: './examples/photos/living.jpg', room: 'living' },
        { path: './examples/photos/kitchen.jpg', room: 'kitchen' },
        { path: './examples/photos/bedroom.jpg', room: 'bedroom' },
        { path: './examples/photos/bathroom.jpg', room: 'bathroom' },
        { path: './examples/photos/backyard.jpg', room: 'backyard' }
      ],
      
      listing: {
        headline: "Beautiful 3BR Home in Great Neighborhood",
        bullets: [
          "Updated kitchen with modern appliances",
          "Spacious living areas with natural light",
          "Private backyard perfect for entertaining"
        ],
        address: "123 Example Street"
      },

      voiceover: {
        voice: 'en-US-Neural2-D',
        speed: 1.0
      },

      output: {
        path: './output/basic-tour.mp4',
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

      tmpDir: './.cache/basic-example'
    }, 
    
    // Progress callback
    (phase, progress, message) => {
      console.log(`[${phase}] ${Math.round(progress)}% - ${message || ''}`);
    });

    console.log('✅ Generation complete!');
    console.log(`   Output: ${result.outputPath}`);
    console.log(`   Duration: ${result.duration.toFixed(1)}s`);
    console.log(`   Veo segments: ${result.veoSegments}`);
    console.log(`   Ken Burns segments: ${result.kenBurnsSegments}`);
    console.log(`   Estimated cost: $${result.estimatedCost.toFixed(2)}`);

  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  }
}

// Check if required environment variables are set
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  console.error('❌ Please set GOOGLE_CLOUD_PROJECT environment variable');
  console.error('   export GOOGLE_CLOUD_PROJECT="your-project-id"');
  process.exit(1);
}

basicExample();
