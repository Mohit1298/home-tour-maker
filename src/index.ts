import fs from 'fs';
import path from 'path';
import { 
  HomeTourConfig, 
  ProgressCallback, 
  PipelineContext,
  Scene,
  VideoSegment,
  AudioTrack,
  AssemblyParams,
  ImageInput
} from './types.js';

// Import pipeline components
import { ImageIngestor } from './pipeline/ingest.js';
import { ScenePlanner } from './pipeline/scene-plan.js';
import { VeoClient } from './pipeline/veo.js';
import { KenBurnsGenerator } from './pipeline/kenburns.js';
import { TTSGenerator } from './pipeline/tts.js';
import { VideoAssembler } from './pipeline/assemble.js';
import { BrandingProcessor, LowerThird } from './pipeline/branding.js';
import { generateSegmentPrompt, generateVoiceoverScript } from './prompts/segmentPrompt.js';

export interface HomeTourResult {
  outputPath: string;
  duration: number;
  veoSegments: number;
  kenBurnsSegments: number;
  estimatedCost: number;
  metadata: {
    totalImages: number;
    roomDistribution: Record<string, number>;
    processingTime: number;
  };
}

export async function makeHomeTour(
  config: HomeTourConfig,
  onProgress?: ProgressCallback
): Promise<HomeTourResult> {
  
  const startTime = Date.now();
  
  // Create pipeline context
  const context: PipelineContext = {
    config,
    tmpDir: config.tmpDir || './.cache/home-tour',
    onProgress
  };

  // Ensure temporary directory exists
  await fs.promises.mkdir(context.tmpDir, { recursive: true });

  try {
    onProgress?.('pipeline', 0, 'Starting home tour generation');

    // Phase 1: Ingest and validate images
    onProgress?.('pipeline', 5, 'Phase 1: Image ingestion');
    const ingestor = new ImageIngestor(context);
    const ingestResult = await ingestor.ingestImages(config.images);
    
    if (ingestResult.warnings.length > 0) {
      console.warn('Image ingestion warnings:', ingestResult.warnings);
    }

    // Phase 2: Plan scenes
    onProgress?.('pipeline', 15, 'Phase 2: Scene planning');
    const planner = new ScenePlanner(context);
    const scenePlan = await planner.planScenes(ingestResult.images, config.output);

    // Phase 3: Generate video segments
    onProgress?.('pipeline', 25, 'Phase 3: Video generation');
    const videoSegments = await generateVideoSegments(ingestResult.images, context);

    // Phase 4: Generate audio
    onProgress?.('pipeline', 60, 'Phase 4: Audio generation');
    const audioTracks = await generateAudioTracks(scenePlan.scenes, config, context);

    // Phase 5: Assemble final video
    onProgress?.('pipeline', 80, 'Phase 5: Video assembly');
    const assembledVideoPath = await assembleVideo(videoSegments, audioTracks, config, context);

    // Phase 6: Apply branding
    onProgress?.('pipeline', 90, 'Phase 6: Branding');
    const finalVideoPath = await applyBranding(assembledVideoPath, scenePlan.scenes, config, context);

    const processingTime = Date.now() - startTime;
    
    onProgress?.('pipeline', 100, 'Home tour generation complete');

    // Calculate results
    const result: HomeTourResult = {
      outputPath: finalVideoPath,
      duration: scenePlan.totalDuration,
      veoSegments: scenePlan.veoSegments,
      kenBurnsSegments: scenePlan.kenBurnsSegments,
      estimatedCost: calculateEstimatedCost(scenePlan.veoSegments),
      metadata: {
        totalImages: ingestResult.totalImages,
        roomDistribution: ingestResult.roomDistribution,
        processingTime
      }
    };

    return result;

  } catch (error) {
    // Cleanup on error
    await cleanupTempDirectory(context.tmpDir);
    throw error;
  }
}

async function generateVideoSegments(
  images: ImageInput[],
  context: PipelineContext
): Promise<VideoSegment[]> {
  
  const videoSegments: VideoSegment[] = [];
  const veoClient = new VeoClient(context);
  const kenBurnsGenerator = new KenBurnsGenerator(context);

  // Sort images by filename numerically to ensure consistent processing order
  const sortedImages = [...images].sort((a, b) => {
    const nameA = path.basename(a.path);
    const nameB = path.basename(b.path);
    
    // Extract numeric part from filename (e.g., "7e5f5_12.jpg" -> 12)
    const numA = parseInt(nameA.match(/_(\d+)\./)?.[1] || '0');
    const numB = parseInt(nameB.match(/_(\d+)\./)?.[1] || '0');
    
    return numA - numB;
  });

  console.log(`Processing ${sortedImages.length} images individually for Veo generation`);

  // Process each image individually
  for (let i = 0; i < sortedImages.length; i++) {
    const image = sortedImages[i];
    const progress = (i / sortedImages.length) * 35;
    const imageName = path.basename(image.path);
    context.onProgress?.('segments', 25 + progress, `Processing image ${i + 1}/${sortedImages.length}: ${imageName}`);
    
    // Create a scene for this single image
    const singleImageScene: Scene = {
      id: `single-image-${i}`,
      room: 'home', // Generic room for single image processing
      images: [image],
      duration: 4, // 4 seconds per segment
      type: 'veo',
      description: `Single image segment ${i + 1}`,
      focusPoints: []
    };

    try {
      // Generate Veo segment for this single image
      const segment = await generateVeoSegment(singleImageScene, [singleImageScene], i, veoClient, context);
      videoSegments.push(segment);
      console.log(`✓ Generated video segment ${i + 1}/${sortedImages.length}`);
    } catch (error) {
      console.error(`✗ Failed to generate video segment ${i + 1}:`, error);
      throw error;
    }
  }

  return videoSegments;
}

function getTotalImageCount(scenes: Scene[]): number {
  return scenes.reduce((total, scene) => total + scene.images.length, 0);
}

async function generateVeoSegment(
  scene: Scene,
  allScenes: Scene[],
  sceneIndex: number,
  veoClient: VeoClient,
  context: PipelineContext
): Promise<VideoSegment> {
  
  // Upload all images to GCS
  const imageGcsUris: string[] = [];
  for (const image of scene.images) {
    const gcsUri = await veoClient.uploadToGcs(
      image.path,
      `inputs/${Date.now()}_${path.basename(image.path)}`,
      context.config.veo.bucketName
    );
    imageGcsUris.push(gcsUri);
  }
  
  // Primary image (first one)
  const imageGcsUri = imageGcsUris[0];
  
  // For single image mode, no reference images
  const refImages: Array<{gcsUri: string; mimeType: string; role: 'asset'}> = []; // Empty array for single image mode

  console.log(`[DEBUG] Scene has ${scene.images.length} images (single image mode)`);
  console.log(`[DEBUG] Primary image: ${imageGcsUri}`);
  console.log(`[DEBUG] Reference images: none (single image mode)`);

  // Get last frame from previous segment if available
  let lastFrameGcsUri: string | undefined;
  if (sceneIndex > 0) {
    // This would reference the last frame from the previous segment
    // For now, we'll skip this for simplicity
  }

  // Generate prompt for this segment
  const prompt = generateSegmentPrompt({
    scene,
    listing: context.config.listing,
    previousRoom: sceneIndex > 0 ? allScenes[sceneIndex - 1].room : undefined,
    nextRoom: sceneIndex < allScenes.length - 1 ? allScenes[sceneIndex + 1].room : undefined,
    segmentIndex: sceneIndex,
    totalSegments: allScenes.length
  });

  // Generate Veo clip with all images
  const veoResult = await veoClient.generateClip({
    projectId: context.config.veo.projectId,
    location: context.config.veo.location,
    model: context.config.veo.model,
    aspect: context.config.output.aspect,
    resolution: context.config.output.resolution,
    duration: Math.min(4, Math.round(scene.duration)) as 4 | 6 | 8,
    generateAudio: context.config.veo.generateAudio ?? false,
    imageGcsUri,
    lastFrameGcsUri,
    refImages, // Include additional images as reference
    storageUri: `gs://${context.config.veo.bucketName}/output/`, // Add storage URI for output
    prompt
  });

  return {
    path: veoResult.videoPath,
    duration: veoResult.duration,
    type: 'veo',
    room: scene.room,
    hasAudio: context.config.veo.generateAudio ?? false
  };
}

async function generateKenBurnsSegment(
  scene: Scene,
  kenBurnsGenerator: KenBurnsGenerator,
  context: PipelineContext
): Promise<VideoSegment> {
  
  const primaryImage = scene.images[0];
  const outputPath = path.join(
    context.tmpDir,
    `kenburns_${scene.id}_${Date.now()}.mp4`
  );

  const { width, height } = getResolutionDimensions(context.config.output.resolution);

  await kenBurnsGenerator.generateOptimizedForRoom(
    primaryImage.path,
    outputPath,
    scene.duration,
    width,
    height,
    scene.room
  );

  return {
    path: outputPath,
    duration: scene.duration,
    type: 'kenburns',
    room: scene.room,
    hasAudio: false
  };
}

async function generateAudioTracks(
  scenes: Scene[],
  config: HomeTourConfig,
  context: PipelineContext
): Promise<AudioTrack[]> {
  
  const audioTracks: AudioTrack[] = [];

  // Generate voiceover if requested or auto-generate
  if (config.voiceover || config.listing) {
    const ttsGenerator = new TTSGenerator(context);
    
    // Generate script if not provided
    let script = config.voiceover?.text;
    if (!script && config.listing) {
      script = generateVoiceoverScript(scenes, config.listing, config.output.targetSeconds);
    }

    if (script) {
      const voiceoverPath = path.join(context.tmpDir, `voiceover_${Date.now()}.mp3`);
      
      await ttsGenerator.synthesizeVoiceover({
        text: script,
        voice: config.voiceover?.voice || 'en-US-Neural2-D',
        speed: config.voiceover?.speed || 1.0,
        outputPath: voiceoverPath
      });

      audioTracks.push({
        path: voiceoverPath,
        type: 'voiceover',
        volume: 1.0,
        startTime: 0,
        duration: config.output.targetSeconds
      });
    }
  }

  // Add background music if provided
  if (config.music) {
    const musicVolume = config.music.volume || 0.3;
    const duckingVolume = audioTracks.length > 0 ? musicVolume * 0.4 : musicVolume;

    audioTracks.push({
      path: config.music.path,
      type: 'music',
      volume: duckingVolume,
      startTime: 0,
      duration: config.output.targetSeconds
    });
  }

  return audioTracks;
}

async function assembleVideo(
  videoSegments: VideoSegment[],
  audioTracks: AudioTrack[],
  config: HomeTourConfig,
  context: PipelineContext
): Promise<string> {
  
  const assembler = new VideoAssembler(context);
  const assembledPath = path.join(context.tmpDir, `assembled_${Date.now()}.mp4`);

  const assemblyParams: AssemblyParams = {
    segments: videoSegments,
    audioTracks,
    outputPath: assembledPath,
    crossfadeDuration: 0.75,
    aspect: config.output.aspect,
    resolution: config.output.resolution,
    fps: config.output.fps || 24
  };

  await assembler.assembleVideo(assemblyParams);
  return assembledPath;
}

async function applyBranding(
  videoPath: string,
  scenes: Scene[],
  config: HomeTourConfig,
  context: PipelineContext
): Promise<string> {
  
  // Ensure output directory exists
  await fs.promises.mkdir(path.dirname(config.output.path), { recursive: true });

  if (!config.brand) {
    // No branding, just copy to final output
    await fs.promises.copyFile(videoPath, config.output.path);
    return config.output.path;
  }

  const brandingProcessor = new BrandingProcessor(context);

  // Generate room lower thirds
  const segmentDurations = scenes.map(s => s.duration);
  const lowerThirds = BrandingProcessor.generateRoomLowerThirds(
    scenes.map(s => s.room),
    segmentDurations,
    'bar'
  );

  // Create end slate if we have listing data
  let endSlate;
  if (config.listing) {
    endSlate = {
      headline: config.listing.headline || 'Thank You',
      subtitle: config.listing.address,
      cta: 'Contact us today to schedule your private showing',
      duration: 3,
      backgroundColor: config.brand.primaryHex || '#000000'
    };
  }

  await brandingProcessor.applyBranding(
    videoPath,
    config.output.path,
    config.brand,
    lowerThirds,
    endSlate
  );

  return config.output.path;
}

function getResolutionDimensions(resolution: '720p' | '1080p'): { width: number; height: number } {
  switch (resolution) {
    case '720p':
      return { width: 1280, height: 720 };
    case '1080p':
      return { width: 1920, height: 1080 };
    default:
      return { width: 1920, height: 1080 };
  }
}

function calculateEstimatedCost(veoSegments: number): number {
  // Rough cost estimation based on Veo pricing
  // This would need to be updated based on actual pricing
  const costPerSegment = 0.50; // Estimated cost per 8-second segment
  return veoSegments * costPerSegment;
}

async function cleanupTempDirectory(tmpDir: string): Promise<void> {
  try {
    if (fs.existsSync(tmpDir)) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn('Failed to cleanup temporary directory:', error);
  }
}

// Export main types for library consumers
export * from './types.js';

// Export utility functions
export { generateVoiceoverScript } from './prompts/segmentPrompt.js';
export { BrandingProcessor } from './pipeline/branding.js';

// Export individual pipeline components for advanced usage
export { ImageIngestor } from './pipeline/ingest.js';
export { ScenePlanner } from './pipeline/scene-plan.js';
export { VeoClient } from './pipeline/veo.js';
export { KenBurnsGenerator } from './pipeline/kenburns.js';
export { TTSGenerator } from './pipeline/tts.js';
export { VideoAssembler } from './pipeline/assemble.js';

// API Functions for direct integration
export async function validateHomeTourConfig(
  images: ImageInput[],
  targetSeconds: number = 90
): Promise<{
  valid: boolean;
  summary: {
    imageCount: number;
    targetSeconds: number;
    roomDistribution: Record<string, number>;
    estimatedCost: number;
    estimatedVeoSegments: number;
    estimatedKenBurnsSegments: number;
  };
  warnings: string[];
}> {
  // Room distribution analysis
  const roomCounts: Record<string, number> = {};
  images.forEach(img => {
    const room = img.room || 'unknown';
    roomCounts[room] = (roomCounts[room] || 0) + 1;
  });

  // Cost and segment estimation
  const maxVeoSegments = Math.min(15, Math.floor(targetSeconds / 6));
  const estimatedCost = maxVeoSegments * 0.50;
  const kenBurnsSegments = Math.max(0, images.length - maxVeoSegments);

  // Generate warnings
  const warnings: string[] = [];
  if (images.length < 6) {
    warnings.push('Less than 6 images provided. Minimum 6 recommended for quality tours.');
  }
  if (images.length > 40) {
    warnings.push('More than 40 images provided. Consider reducing for optimal processing time.');
  }
  if (!roomCounts.exterior) {
    warnings.push('No exterior images detected. Consider adding exterior shots.');
  }
  if (!roomCounts.kitchen) {
    warnings.push('No kitchen images detected. Kitchen photos are important for home tours.');
  }

  return {
    valid: true,
    summary: {
      imageCount: images.length,
      targetSeconds,
      roomDistribution: roomCounts,
      estimatedCost,
      estimatedVeoSegments: maxVeoSegments,
      estimatedKenBurnsSegments: kenBurnsSegments
    },
    warnings
  };
}

export async function getAvailableVoices(languageCode: string = 'en-US'): Promise<{
  voices: Array<{ name: string; gender: string; type: string }>;
  languageCode: string;
}> {
  // This could use the actual TTS client, but for now return common voices
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

  return { voices, languageCode };
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  phase: string;
  message?: string;
  result?: HomeTourResult;
  error?: string;
  createdAt: Date;
  estimatedTimeRemaining?: number;
}

// Job queue for async processing
const activeJobs = new Map<string, JobStatus>();

export async function queueHomeTourGeneration(
  config: HomeTourConfig,
  jobId?: string
): Promise<{ jobId: string; status: JobStatus }> {
  
  const id = jobId || generateJobId();
  
  const job: JobStatus = {
    id,
    status: 'pending',
    progress: 0,
    phase: 'queued',
    createdAt: new Date()
  };

  activeJobs.set(id, job);

  // Process asynchronously
  processJobAsync(id, config).catch(error => {
    const jobStatus = activeJobs.get(id);
    if (jobStatus) {
      jobStatus.status = 'failed';
      jobStatus.error = error instanceof Error ? error.message : 'Unknown error';
    }
  });

  return { jobId: id, status: job };
}

export function getJobStatus(jobId: string): JobStatus | null {
  return activeJobs.get(jobId) || null;
}

export function getAllJobs(): JobStatus[] {
  return Array.from(activeJobs.values());
}

export function cancelJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (job && job.status === 'pending') {
    job.status = 'failed';
    job.error = 'Cancelled by user';
    return true;
  }
  return false;
}

async function processJobAsync(jobId: string, config: HomeTourConfig): Promise<void> {
  const job = activeJobs.get(jobId)!;
  
  try {
    job.status = 'processing';
    job.phase = 'starting';

    // Progress handler that updates the job
    const progressHandler = (phase: string, progress: number, message?: string) => {
      job.progress = progress;
      job.phase = phase;
      job.message = message;
      
      // Estimate time remaining based on progress
      if (progress > 5) {
        const elapsed = Date.now() - job.createdAt.getTime();
        const estimated = (elapsed / progress) * (100 - progress);
        job.estimatedTimeRemaining = Math.round(estimated / 1000); // seconds
      }
    };

    // Generate the tour
    const result = await makeHomeTour(config, progressHandler);

    // Mark as completed
    job.status = 'completed';
    job.progress = 100;
    job.phase = 'completed';
    job.result = result;
    job.estimatedTimeRemaining = 0;

  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Unknown error';
  }
}

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Default export for convenience
export default makeHomeTour;
