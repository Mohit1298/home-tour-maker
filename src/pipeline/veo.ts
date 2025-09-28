import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { VeoParams, VeoResult, PipelineContext } from '../types.js';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath!);

interface VeoOperation {
  name: string;
  done?: boolean;
  response?: {
    '@type'?: string;
    raiMediaFilteredCount?: number;
    videos?: Array<{
      gcsUri?: string;
      mimeType?: string;
      bytesBase64Encoded?: string;
    }>;
    predictions?: Array<{
      videoUri?: string;
      video?: {
        gcsUri: string;
        bytesBase64Encoded?: string;
      };
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

export class VeoClient {
  private auth: GoogleAuth;
  private storage: Storage;
  private context: PipelineContext;

  constructor(context: PipelineContext) {
    this.context = context;
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    this.storage = new Storage();
  }

  async generateClip(params: VeoParams): Promise<VeoResult> {
    this.context.onProgress?.('veo', 0, `Generating Veo clip for ${params.imageGcsUri}`);

    // Get auth token
    const client = await this.auth.getClient();
    const token = await (client as any).getAccessToken();

    // Build request
    const url = `https://${params.location}-aiplatform.googleapis.com/v1/projects/${params.projectId}/locations/${params.location}/publishers/google/models/${params.model}:predictLongRunning`;

    const instances: any = {
      prompt: params.prompt
    };

    // For multi-image generation, use all images as reference images (including primary)
    if (params.refImages && params.refImages.length > 0) {
      // Include the primary image as the first reference image
      const allImages = [
        {
          gcsUri: params.imageGcsUri,
          mimeType: this.getMimeType(params.imageGcsUri),
          role: 'asset' as const
        },
        ...params.refImages
      ];
      
      instances.referenceImages = allImages.map(ref => ({
        image: {
          gcsUri: ref.gcsUri,
          mimeType: ref.mimeType
        },
        referenceType: ref.role
      }));
    } else {
      // Single image generation - use image field
      instances.image = { 
        gcsUri: params.imageGcsUri, 
        mimeType: this.getMimeType(params.imageGcsUri) 
      };
    }

    // Add lastFrame if provided
    if (params.lastFrameGcsUri) {
      instances.lastFrame = {
        gcsUri: params.lastFrameGcsUri,
        mimeType: 'image/png'
      };
    }

    const requestBody = {
      instances: [instances],
      parameters: {
        durationSeconds: params.duration, // Use durationSeconds as per API docs
        aspectRatio: params.aspect === '16:9' ? '16:9' : '9:16', // Ensure correct format
        sampleCount: 1,
        generateAudio: params.generateAudio ?? false, // Disable audio by default
        personGeneration: 'disallow', // Safety setting
        ...(params.resolution && { resolution: params.resolution }),
        ...(params.seed && { seed: params.seed }),
        ...(params.storageUri && { storageUri: params.storageUri })
      }
    };

    this.context.onProgress?.('veo', 10, 'Submitting generation request');

    console.log(`[VEO DEBUG] Request URL: ${url}`);
    console.log(`[VEO DEBUG] Request body:`, JSON.stringify(requestBody, null, 2));

    // Submit request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token ?? token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Veo API request failed: ${response.status} ${error}`);
    }

    const operation: VeoOperation = await response.json() as VeoOperation;

    this.context.onProgress?.('veo', 20, 'Polling for completion');

    // Poll operation until complete
    const result = await this.pollOperation(operation.name, token.token ?? token);

    // Download and process result
    return await this.processResult(result, params);
  }

  private async pollOperation(operationName: string, token: string, maxAttempts = 60): Promise<VeoOperation> {
    let attempts = 0;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (attempts < maxAttempts) {
      attempts++;
      
      this.context.onProgress?.('veo', 20 + (attempts / maxAttempts) * 60, 
        `Polling operation (${attempts}/${maxAttempts})`);

      // Use the correct fetchPredictOperation endpoint for Veo 3 Preview
      const location = this.getLocationFromOperationName(operationName);
      const project = this.getProjectFromOperationName(operationName);
      const model = 'veo-3.0-fast-generate-001';
      const pollUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:fetchPredictOperation`;
      
      const requestBody = {
        operationName: operationName
      };
      
      const response = await fetch(pollUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Failed to poll operation: ${response.status}`);
      }

      const operation: VeoOperation = await response.json() as VeoOperation;

      if (operation.done) {
        if (operation.error) {
          throw new Error(`Veo generation failed: ${operation.error.message}`);
        }
        return operation;
      }

      // Exponential backoff with jitter
      const baseDelay = Math.min(1000 * Math.pow(1.5, attempts), 30000);
      const jitter = Math.random() * 1000;
      await delay(baseDelay + jitter);
    }

    throw new Error('Veo operation timed out');
  }

  private async processResult(operation: VeoOperation, params: VeoParams): Promise<VeoResult> {
    // Handle both old predictions format and new videos format
    let videoGcsUri: string;

    if (operation.response?.videos?.[0]) {
      // New Veo 3 Preview format
      const video = operation.response.videos[0];
      if (video.gcsUri) {
        videoGcsUri = video.gcsUri;
      } else {
        throw new Error('No video GCS URI in Veo response');
      }
    } else if (operation.response?.predictions?.[0]) {
      // Legacy format
      const prediction = operation.response.predictions[0];
      if (prediction.videoUri) {
        videoGcsUri = prediction.videoUri;
      } else if (prediction.video?.gcsUri) {
        videoGcsUri = prediction.video.gcsUri;
      } else {
        throw new Error('No video URI in Veo response');
      }
    } else {
      throw new Error('No videos or predictions in Veo response');
    }

    this.context.onProgress?.('veo', 85, 'Downloading generated video');

    // Download video from GCS
    const outputPath = path.join(this.context.tmpDir, `veo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`);
    await this.downloadFromGcs(videoGcsUri, outputPath);

    this.context.onProgress?.('veo', 95, 'Extracting last frame');

    // Extract last frame for continuity
    const lastFramePath = await this.extractLastFrame(outputPath, params.duration);

    this.context.onProgress?.('veo', 100, 'Veo clip generation complete');

    return {
      videoPath: outputPath,
      lastFramePath,
      duration: params.duration
    };
  }

  private async downloadFromGcs(gcsUri: string, outputPath: string): Promise<void> {
    // Parse GCS URI: gs://bucket/path
    const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid GCS URI: ${gcsUri}`);
    }

    const [, bucketName, objectPath] = match;
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(objectPath);

    // Ensure output directory exists
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    // Download file
    await file.download({ destination: outputPath });
  }

  async uploadToGcs(localPath: string, gcsPath: string, bucketName?: string): Promise<string> {
    const bucket = bucketName || this.context.config.veo?.bucketName;
    if (!bucket) {
      throw new Error('No GCS bucket specified');
    }

    const storage = this.storage.bucket(bucket);
    const file = storage.file(gcsPath);

    await file.save(await fs.promises.readFile(localPath));
    
    return `gs://${bucket}/${gcsPath}`;
  }

  private async extractLastFrame(videoPath: string, duration: number): Promise<string> {
    const lastFramePath = videoPath.replace('.mp4', '_last_frame.png');
    
    return new Promise<string>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          `-ss ${Math.max(0, duration - 0.04)}`, // 40ms before end
          '-frames:v 1',
          '-q:v 2'
        ])
        .save(lastFramePath)
        .on('end', () => resolve(lastFramePath))
        .on('error', reject);
    });
  }

  private getMimeType(path: string): string {
    const ext = path.toLowerCase().split('.').pop();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  // Rate limiting and retry logic
  private async withRetry<T>(
    operation: () => Promise<T>, 
    maxRetries = 3, 
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (error instanceof Error && (
          error.message.includes('quota') ||
          error.message.includes('permission') ||
          error.message.includes('invalid')
        )) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
          this.context.onProgress?.('veo', 0, `Retry ${attempt}/${maxRetries} in ${Math.round(delay/1000)}s`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  private getProjectFromOperationName(operationName: string): string {
    // Extract project from operation name like: projects/PROJECT/locations/LOCATION/operations/OPERATION_ID
    const match = operationName.match(/projects\/([^\/]+)/);
    return match ? match[1] : 'ipflix'; // fallback to default project
  }

  private getLocationFromOperationName(operationName: string): string {
    // Extract location from operation name
    const match = operationName.match(/locations\/([^\/]+)/);
    return match ? match[1] : 'us-central1'; // fallback to default location
  }
}
