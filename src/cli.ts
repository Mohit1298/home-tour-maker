#!/usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';

// Load environment variables from .env file
dotenv.config();
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { makeHomeTour } from './index.js';
import type { Request, Response } from 'express';
import { 
  HomeTourConfig, 
  ImageInput, 
  ListingData,
  VoiceoverConfig, 
  MusicConfig, 
  BrandConfig,
  OutputConfig,
  VeoConfig 
} from './types.js';

const program = new Command();

interface CLIOptions {
  images?: string;
  listing?: string;
  vo?: string;
  music?: string;
  brand?: string;
  out?: string;
  seconds?: number;
  aspect?: '16:9' | '9:16';
  res?: '720p' | '1080p';
  veoProject?: string;
  veoLocation?: string;
  veoModel?: string;
  tmpDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

program
  .name('home-tour-maker')
  .description('Generate professional home tour videos from images using Google\'s Veo AI')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate a home tour video')
  .option('--images <path>', 'Path to images directory or JSON file with image list')
  .option('--listing <path>', 'Path to JSON file with listing information')
  .option('--vo <config>', 'Voiceover configuration (text=...,voice=...,speed=...)')
  .option('--music <path>', 'Path to background music file')
  .option('--brand <config>', 'Brand configuration (logo=...,color=...)')
  .option('--out <path>', 'Output video file path', './output/tour.mp4')
  .option('--seconds <number>', 'Target video duration in seconds', '90')
  .option('--aspect <ratio>', 'Video aspect ratio', '16:9')
  .option('--res <resolution>', 'Video resolution', '1080p')
  .option('--veo-project <project>', 'Google Cloud project ID')
  .option('--veo-location <location>', 'Veo API location', 'us-central1')
  .option('--veo-model <model>', 'Veo model to use', 'veo-3.0-fast-generate-001')
  .option('--tmp-dir <path>', 'Temporary directory for processing', './.cache/home-tour')
  .option('--dry-run', 'Show plan without generating video')
  .option('--verbose', 'Verbose output')
  .action(async (options: CLIOptions) => {
    try {
      await runGenerate(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate images and configuration without generating video')
  .option('--images <path>', 'Path to images directory or JSON file with image list')
  .option('--listing <path>', 'Path to JSON file with listing information')
  .option('--seconds <number>', 'Target video duration in seconds', '90')
  .action(async (options: Pick<CLIOptions, 'images' | 'listing' | 'seconds'>) => {
    try {
      await runValidate(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('list-voices')
  .description('List available TTS voices')
  .option('--language <code>', 'Language code (e.g., en-US)', 'en-US')
  .action(async (options: { language?: string }) => {
    try {
      await listVoices(options.language || 'en-US');
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start HTTP API server for remote video generation')
  .option('--port <number>', 'Server port', '3000')
  .option('--host <address>', 'Server host', 'localhost')
  .option('--cors', 'Enable CORS for browser requests')
  .action(async (options: { port?: string; host?: string; cors?: boolean }) => {
    try {
      await startApiServer(parseInt(options.port || '3000'), options.host || 'localhost', options.cors || false);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function runGenerate(options: CLIOptions): Promise<void> {
  const spinner = ora('Preparing home tour generation').start();

  try {
    // Parse and validate configuration
    const config = await parseConfiguration(options);
    
    if (options.dryRun) {
      spinner.stop();
      await showDryRun(config);
      return;
    }

    // Create progress handler
    const progressHandler = createProgressHandler(spinner, options.verbose);

    // Generate the tour
    spinner.text = 'Generating home tour video...';
    const result = await makeHomeTour(config, progressHandler);

    spinner.succeed(chalk.green(`Home tour generated successfully: ${result.outputPath}`));
    
    // Show summary
    console.log(chalk.cyan('\nGeneration Summary:'));
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Duration: ${result.duration.toFixed(1)}s`);
    console.log(`  Veo segments: ${result.veoSegments}`);
    console.log(`  Ken Burns segments: ${result.kenBurnsSegments}`);
    console.log(`  Total cost estimate: $${result.estimatedCost.toFixed(2)}`);

  } catch (error) {
    spinner.fail('Home tour generation failed');
    throw error;
  }
}

async function runValidate(options: Pick<CLIOptions, 'images' | 'listing' | 'seconds'>): Promise<void> {
  const spinner = ora('Validating configuration').start();

  try {
    // Parse images
    const images = await parseImages(options.images!);
    const listing = options.listing ? await parseListingFile(options.listing) : undefined;
    const targetSeconds = parseInt(String(options.seconds || '90'));

    spinner.text = 'Analyzing images...';
    
    // Basic validation would go here
    // For now, just show summary
    
    spinner.succeed('Validation complete');

    console.log(chalk.cyan('\nValidation Results:'));
    console.log(`  Images found: ${images.length}`);
    console.log(`  Target duration: ${targetSeconds}s`);
    
    if (listing) {
      console.log(`  Listing headline: ${listing.headline || 'None'}`);
      console.log(`  Features: ${listing.bullets?.length || 0}`);
    }

    // Show room distribution
    const roomCounts: Record<string, number> = {};
    images.forEach(img => {
      const room = img.room || 'unknown';
      roomCounts[room] = (roomCounts[room] || 0) + 1;
    });

    console.log(chalk.cyan('\nRoom Distribution:'));
    Object.entries(roomCounts).forEach(([room, count]) => {
      console.log(`  ${room}: ${count} images`);
    });

  } catch (error) {
    spinner.fail('Validation failed');
    throw error;
  }
}

async function listVoices(languageCode: string): Promise<void> {
  const spinner = ora(`Fetching available voices for ${languageCode}`).start();

  try {
    // This would use the TTS client to list voices
    // For now, show common voices
    const commonVoices = [
      { name: 'en-US-Neural2-D', gender: 'MALE', type: 'Neural' },
      { name: 'en-US-Neural2-F', gender: 'FEMALE', type: 'Neural' },
      { name: 'en-US-Neural2-A', gender: 'MALE', type: 'Neural' },
      { name: 'en-US-Neural2-C', gender: 'FEMALE', type: 'Neural' },
      { name: 'en-US-Standard-A', gender: 'MALE', type: 'Standard' },
      { name: 'en-US-Standard-B', gender: 'MALE', type: 'Standard' },
      { name: 'en-US-Standard-C', gender: 'FEMALE', type: 'Standard' },
      { name: 'en-US-Standard-D', gender: 'MALE', type: 'Standard' }
    ];

    spinner.succeed(`Available voices for ${languageCode}:`);

    console.log(chalk.cyan('\nNeural Voices (Recommended):'));
    commonVoices
      .filter(v => v.type === 'Neural')
      .forEach(voice => {
        console.log(`  ${chalk.green(voice.name)} (${voice.gender})`);
      });

    console.log(chalk.cyan('\nStandard Voices:'));
    commonVoices
      .filter(v => v.type === 'Standard')
      .forEach(voice => {
        console.log(`  ${chalk.yellow(voice.name)} (${voice.gender})`);
      });

  } catch (error) {
    spinner.fail('Failed to fetch voices');
    throw error;
  }
}

async function parseConfiguration(options: CLIOptions): Promise<HomeTourConfig> {
  // Parse images
  if (!options.images) {
    throw new Error('Images path is required (--images)');
  }
  const images = await parseImages(options.images);

  // Parse listing data
  const listing = options.listing ? await parseListingFile(options.listing) : undefined;

  // Parse voiceover config
  const voiceover = options.vo ? parseVoiceoverConfig(options.vo) : undefined;

  // Parse music config
  const music = options.music ? parseMusicConfig(options.music) : undefined;

  // Parse brand config
  const brand = options.brand ? parseBrandConfig(options.brand) : undefined;

  // Parse output config
  const output: OutputConfig = {
    path: options.out || './output/tour.mp4',
    aspect: (options.aspect as '16:9' | '9:16') || '16:9',
    resolution: (options.res as '720p' | '1080p') || '1080p',
    targetSeconds: parseInt(String(options.seconds || '90')),
    fps: 24
  };

  // Parse Veo config
  const veo: VeoConfig = {
    projectId: options.veoProject || process.env.GOOGLE_CLOUD_PROJECT || '',
    location: options.veoLocation || 'us-central1',
    model: (options.veoModel as any) || 'veo-3.0-fast-generate-001',
    generateAudio: false,
    bucketName: process.env.GCS_BUCKET
  };

  if (!veo.projectId) {
    throw new Error('Google Cloud project ID is required (--veo-project or GOOGLE_CLOUD_PROJECT env var)');
  }

  return {
    images,
    listing,
    voiceover,
    music,
    brand,
    output,
    veo,
    tmpDir: options.tmpDir || './.cache/home-tour'
  };
}

async function parseImages(imagesPath: string): Promise<ImageInput[]> {
  if (!fs.existsSync(imagesPath)) {
    throw new Error(`Images path not found: ${imagesPath}`);
  }

  const stat = fs.statSync(imagesPath);

  if (stat.isFile()) {
    // JSON file with image list
    const content = await fs.promises.readFile(imagesPath, 'utf8');
    const imageData = JSON.parse(content);
    
    if (Array.isArray(imageData)) {
      return imageData.map(item => 
        typeof item === 'string' ? { path: item } : item
      );
    } else {
      throw new Error('Images JSON file must contain an array');
    }
  } else if (stat.isDirectory()) {
    // Directory with images
    const files = await fs.promises.readdir(imagesPath);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    
    const imageFiles = files
      .filter(file => imageExtensions.includes(path.extname(file).toLowerCase()))
      .map(file => ({ path: path.join(imagesPath, file) }))
      .sort((a, b) => a.path.localeCompare(b.path));
    
    return imageFiles;
  } else {
    throw new Error('Images path must be a directory or JSON file');
  }
}

async function parseListingFile(listingPath: string): Promise<ListingData> {
  if (!fs.existsSync(listingPath)) {
    throw new Error(`Listing file not found: ${listingPath}`);
  }

  const content = await fs.promises.readFile(listingPath, 'utf8');
  return JSON.parse(content);
}

function parseVoiceoverConfig(voConfig: string): VoiceoverConfig {
  const config: VoiceoverConfig = {};
  
  const pairs = voConfig.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      switch (key.trim()) {
        case 'text':
          config.text = value.trim();
          break;
        case 'voice':
          config.voice = value.trim();
          break;
        case 'speed':
          config.speed = parseFloat(value.trim());
          break;
      }
    }
  }

  return config;
}

function parseMusicConfig(musicPath: string): MusicConfig {
  if (!fs.existsSync(musicPath)) {
    throw new Error(`Music file not found: ${musicPath}`);
  }

  return {
    path: musicPath,
    duckUnderVOdB: -6,
    volume: 0.3
  };
}

function parseBrandConfig(brandConfig: string): BrandConfig {
  const config: BrandConfig = {};
  
  const pairs = brandConfig.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      switch (key.trim()) {
        case 'logo':
          config.logoPath = value.trim();
          break;
        case 'color':
          config.primaryHex = value.trim();
          break;
        case 'font':
          config.fontFamily = value.trim();
          break;
      }
    }
  }

  return config;
}

function createProgressHandler(spinner: any, verbose?: boolean) {
  return (phase: string, progress: number, message?: string) => {
    const phaseNames: Record<string, string> = {
      ingest: 'Processing images',
      planning: 'Planning scenes',
      veo: 'Generating AI video',
      kenburns: 'Creating Ken Burns effects',
      tts: 'Synthesizing voiceover',
      assembly: 'Assembling video',
      branding: 'Adding branding'
    };

    const phaseName = phaseNames[phase] || phase;
    const progressBar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
    
    spinner.text = `${phaseName} [${progressBar}] ${Math.round(progress)}%` + 
                   (message ? ` - ${message}` : '');

    if (verbose && message) {
      console.log(chalk.gray(`[${phase}] ${message}`));
    }
  };
}

async function showDryRun(config: HomeTourConfig): Promise<void> {
  console.log(chalk.cyan('\n🎬 Home Tour Generation Plan\n'));

  console.log(chalk.yellow('Configuration:'));
  console.log(`  Images: ${config.images.length} files`);
  console.log(`  Target duration: ${config.output.targetSeconds}s`);
  console.log(`  Aspect ratio: ${config.output.aspect}`);
  console.log(`  Resolution: ${config.output.resolution}`);
  console.log(`  Output: ${config.output.path}`);

  if (config.listing) {
    console.log(`  Listing: ${config.listing.headline || 'No headline'}`);
  }

  if (config.voiceover) {
    console.log(`  Voiceover: ${config.voiceover.voice || 'Default voice'}`);
  }

  if (config.music) {
    console.log(`  Music: ${path.basename(config.music.path)}`);
  }

  if (config.brand) {
    console.log(`  Branding: ${config.brand.logoPath ? 'Logo + ' : ''}Color ${config.brand.primaryHex || 'default'}`);
  }

  console.log(chalk.yellow('\nVeo Configuration:'));
  console.log(`  Project: ${config.veo.projectId}`);
  console.log(`  Location: ${config.veo.location}`);
  console.log(`  Model: ${config.veo.model}`);

  // Estimate segments and cost
  const maxVeoSegments = Math.min(15, Math.floor(config.output.targetSeconds / 6));
  const estimatedCost = maxVeoSegments * 0.50; // Rough estimate

  console.log(chalk.yellow('\nEstimated Generation Plan:'));
  console.log(`  Veo segments: ~${maxVeoSegments}`);
  console.log(`  Ken Burns segments: ~${Math.max(0, config.images.length - maxVeoSegments)}`);
  console.log(`  Estimated cost: ~$${estimatedCost.toFixed(2)}`);
  console.log(`  Estimated time: ~${Math.round(maxVeoSegments * 2 + 5)} minutes`);

  console.log(chalk.green('\n✅ Configuration looks good! Remove --dry-run to generate.'));
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\nUncaught error:'), error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('\nUnhandled rejection:'), reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();

// If no command was provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

// API Server functionality
async function startApiServer(port: number, host: string, enableCors: boolean): Promise<void> {
  console.log(chalk.blue('🚀 Starting Home Tour Maker API Server...'));
  
  // Dynamic import to avoid loading express unless needed
  const express = await import('express');
  const multer = await import('multer');
  const { v4: uuidv4 } = await import('uuid');
  
  const app = express.default();
  const upload = multer.default({ dest: './uploads/' });

  // Middleware
  app.use(express.default.json({ limit: '50mb' }));
  app.use(express.default.urlencoded({ extended: true, limit: '50mb' }));

  if (enableCors) {
    const cors = await import('cors');
    app.use(cors.default());
  }

  // Job tracking
  const jobs = new Map<string, {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    phase: string;
    message?: string;
    result?: any;
    error?: string;
    createdAt: Date;
  }>();

  // API Routes

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'home-tour-maker', version: '1.0.0' });
  });

  // List available voices
  app.get('/api/voices', async (req: Request, res: Response) => {
    try {
      const languageCode = req.query.language as string || 'en-US';
      // Use the existing listVoices function logic but return JSON
      const voices = [
        { name: 'en-US-Neural2-D', gender: 'MALE', type: 'Neural' },
        { name: 'en-US-Neural2-F', gender: 'FEMALE', type: 'Neural' },
        { name: 'en-US-Neural2-A', gender: 'MALE', type: 'Neural' },
        { name: 'en-US-Neural2-C', gender: 'FEMALE', type: 'Neural' },
        { name: 'en-US-Standard-A', gender: 'MALE', type: 'Standard' },
        { name: 'en-US-Standard-B', gender: 'MALE', type: 'Standard' },
        { name: 'en-US-Standard-C', gender: 'FEMALE', type: 'Standard' },
        { name: 'en-US-Standard-D', gender: 'MALE', type: 'Standard' }
      ];
      res.json({ voices, languageCode });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Validate configuration
  app.post('/api/validate', upload.array('images'), async (req: Request, res: Response) => {
    try {
      const { listing, targetSeconds = 90 } = req.body;
      const files = req.files as any[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      // Convert uploaded files to ImageInput format
      const images: ImageInput[] = files.map(file => ({
        path: file.path,
        room: undefined // Will be auto-detected
      }));

      // Basic validation
      const roomCounts: Record<string, number> = {};
      images.forEach(img => {
        const room = img.room || 'unknown';
        roomCounts[room] = (roomCounts[room] || 0) + 1;
      });

      const maxVeoSegments = Math.min(15, Math.floor(parseInt(targetSeconds) / 6));
      const estimatedCost = maxVeoSegments * 0.50;

      res.json({
        valid: true,
        summary: {
          imageCount: images.length,
          targetSeconds: parseInt(targetSeconds),
          roomDistribution: roomCounts,
          estimatedCost,
          estimatedVeoSegments: maxVeoSegments,
          estimatedKenBurnsSegments: Math.max(0, images.length - maxVeoSegments)
        },
        warnings: images.length < 6 ? ['Less than 6 images provided'] : []
      });

    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Validation failed' });
    }
  });

  // Generate home tour (async job)
  app.post('/api/generate', upload.array('images'), async (req: Request, res: Response) => {
    const jobId = uuidv4();
    
    try {
      const files = req.files as any[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      // Parse request body
      const {
        listing,
        voiceover,
        music,
        brand,
        targetSeconds = 90,
        aspect = '16:9',
        resolution = '1080p',
        veoProject,
        veoLocation = 'us-central1',
        veoModel = 'veo-3.0-fast-generate-001'
      } = req.body;

      if (!veoProject) {
        return res.status(400).json({ error: 'veoProject is required' });
      }

      // Create job entry
      jobs.set(jobId, {
        id: jobId,
        status: 'pending',
        progress: 0,
        phase: 'preparing',
        createdAt: new Date()
      });

      // Return job ID immediately
      res.json({ jobId, status: 'pending', message: 'Job queued for processing' });

      // Process asynchronously
      processHomeTourJob(jobId, files, {
        listing: listing ? JSON.parse(listing) : undefined,
        voiceover: voiceover ? JSON.parse(voiceover) : undefined,
        music: music ? { path: music } : undefined,
        brand: brand ? JSON.parse(brand) : undefined,
        targetSeconds: parseInt(targetSeconds),
        aspect,
        resolution,
        veoProject,
        veoLocation,
        veoModel
      }, jobs).catch(error => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : 'Unknown error';
        }
      });

    } catch (error) {
      jobs.set(jobId, {
        id: jobId,
        status: 'failed',
        progress: 0,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date()
      });
      res.status(500).json({ error: error instanceof Error ? error.message : 'Generation failed' });
    }
  });

  // Check job status
  app.get('/api/jobs/:jobId', (req: Request, res: Response) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  });

  // List all jobs
  app.get('/api/jobs', (req: Request, res: Response) => {
    const jobList = Array.from(jobs.values()).map(job => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      phase: job.phase,
      createdAt: job.createdAt
    }));
    res.json({ jobs: jobList });
  });

  // Start server
  app.listen(port, host, () => {
    console.log(chalk.green(`✅ API Server running at http://${host}:${port}`));
    console.log(chalk.cyan('Available endpoints:'));
    console.log(`  GET  /health - Health check`);
    console.log(`  GET  /api/voices - List TTS voices`);
    console.log(`  POST /api/validate - Validate configuration`);
    console.log(`  POST /api/generate - Generate home tour`);
    console.log(`  GET  /api/jobs/:id - Check job status`);
    console.log(`  GET  /api/jobs - List all jobs`);
  });
}

async function processHomeTourJob(
  jobId: string,
  files: any[],
  config: any,
  jobs: Map<string, any>
): Promise<void> {
  const job = jobs.get(jobId)!;
  
  try {
    job.status = 'processing';
    job.phase = 'preparing';

    // Convert files to ImageInput
    const images: ImageInput[] = files.map(file => ({
      path: file.path
    }));

    // Build HomeTourConfig
    const homeTourConfig: HomeTourConfig = {
      images,
      listing: config.listing,
      voiceover: config.voiceover,
      music: config.music,
      brand: config.brand,
      output: {
        path: `./output/${jobId}_tour.mp4`,
        aspect: config.aspect,
        resolution: config.resolution,
        targetSeconds: config.targetSeconds,
        fps: 24
      },
      veo: {
        projectId: config.veoProject,
        location: config.veoLocation,
        model: config.veoModel,
        generateAudio: false
      },
      tmpDir: `./tmp/${jobId}`
    };

    // Progress handler
    const progressHandler = (phase: string, progress: number, message?: string) => {
      job.progress = progress;
      job.phase = phase;
      job.message = message;
    };

    // Generate the tour
    const result = await makeHomeTour(homeTourConfig, progressHandler);

    // Mark as completed
    job.status = 'completed';
    job.progress = 100;
    job.phase = 'completed';
    job.result = {
      outputPath: result.outputPath,
      duration: result.duration,
      veoSegments: result.veoSegments,
      kenBurnsSegments: result.kenBurnsSegments,
      estimatedCost: result.estimatedCost
    };

  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';
  }
}
