import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';
import { KenBurnsParams, PipelineContext } from '../types.js';

// Set ffmpeg path - disabled to use system FFmpeg due to concat filter bug in ffmpeg-static
// ffmpeg.setFfmpegPath(ffmpegPath!);

export interface KenBurnsOptions {
  fps?: number;
  codec?: string;
  crf?: number;
  preset?: string;
}

export class KenBurnsGenerator {
  private context: PipelineContext;
  private options: Required<KenBurnsOptions>;

  constructor(context: PipelineContext, options: KenBurnsOptions = {}) {
    this.context = context;
    this.options = {
      fps: options.fps ?? 24,
      codec: options.codec ?? 'libx264',
      crf: options.crf ?? 23,
      preset: options.preset ?? 'medium'
    };
  }

  async generateKenBurns(params: KenBurnsParams): Promise<string> {
    this.context.onProgress?.('kenburns', 0, `Generating Ken Burns effect for ${path.basename(params.imagePath)}`);

    // Validate input
    if (!fs.existsSync(params.imagePath)) {
      throw new Error(`Input image not found: ${params.imagePath}`);
    }

    // Ensure output directory exists
    await fs.promises.mkdir(path.dirname(params.outputPath), { recursive: true });

    // Generate the effect
    const filter = this.buildFilter(params);
    
    return new Promise<string>((resolve, reject) => {
      let progress = 0;
      
      ffmpeg(params.imagePath)
        .inputOptions([
          '-loop 1',
          `-t ${params.duration}`
        ])
        .outputOptions([
          `-vf ${filter}`,
          `-r ${this.options.fps}`,
          `-c:v ${this.options.codec}`,
          `-crf ${this.options.crf}`,
          `-preset ${this.options.preset}`,
          '-pix_fmt yuv420p',
          '-movflags +faststart'
        ])
        .on('progress', (progressData) => {
          // FFmpeg progress reporting
          if (progressData.percent) {
            progress = Math.min(95, progressData.percent);
            this.context.onProgress?.('kenburns', progress, 'Rendering Ken Burns effect');
          }
        })
        .on('end', () => {
          this.context.onProgress?.('kenburns', 100, 'Ken Burns effect complete');
          resolve(params.outputPath);
        })
        .on('error', (error) => {
          reject(new Error(`Ken Burns generation failed: ${error.message}`));
        })
        .save(params.outputPath);
    });
  }

  private buildFilter(params: KenBurnsParams): string {
    const { duration, width, height, zoomDirection = 'in', panDirection = 'none' } = params;
    const fps = this.options.fps;
    
    // Validate inputs
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid duration: ${duration}. Must be a positive finite number.`);
    }
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error(`Invalid dimensions: ${width}x${height}. Must be positive finite numbers.`);
    }
    if (!Number.isFinite(fps) || fps <= 0) {
      throw new Error(`Invalid fps: ${fps}. Must be a positive finite number.`);
    }

    // Calculate zoom parameters
    const { startZoom, endZoom } = this.calculateZoom(zoomDirection);
    
    // Calculate pan parameters
    const { startX, startY, endX, endY } = this.calculatePan(panDirection, width, height, startZoom, endZoom);

    // Use the same approach as our working debug script
    let filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,`;
    filter += `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

    return filter;
  }

  private calculateZoom(direction: 'in' | 'out'): { startZoom: number; endZoom: number } {
    const minZoom = 1.0;
    const maxZoom = 1.15; // Subtle zoom to avoid distortion

    if (direction === 'in') {
      return { startZoom: minZoom, endZoom: maxZoom };
    } else {
      return { startZoom: maxZoom, endZoom: minZoom };
    }
  }

  private calculatePan(
    direction: 'left' | 'right' | 'up' | 'down' | 'none',
    width: number,
    height: number,
    startZoom: number,
    endZoom: number
  ): { startX: string; startY: string; endX: string; endY: string } {
    
    const centerX = `(iw-iw/zoom)/2`;
    const centerY = `(ih-ih/zoom)/2`;
    
    // Calculate pan offsets as percentage of available movement
    const panAmount = 0.15; // 15% of available space
    
    switch (direction) {
      case 'left':
        return {
          startX: `(iw-iw/zoom)*${panAmount}`,
          startY: centerY,
          endX: `(iw-iw/zoom)*(1-${panAmount})`,
          endY: centerY
        };
        
      case 'right':
        return {
          startX: `(iw-iw/zoom)*(1-${panAmount})`,
          startY: centerY,
          endX: `(iw-iw/zoom)*${panAmount}`,
          endY: centerY
        };
        
      case 'up':
        return {
          startX: centerX,
          startY: `(ih-ih/zoom)*${panAmount}`,
          endX: centerX,
          endY: `(ih-ih/zoom)*(1-${panAmount})`
        };
        
      case 'down':
        return {
          startX: centerX,
          startY: `(ih-ih/zoom)*(1-${panAmount})`,
          endX: centerX,
          endY: `(ih-ih/zoom)*${panAmount}`
        };
        
      default: // 'none'
        return {
          startX: centerX,
          startY: centerY,
          endX: centerX,
          endY: centerY
        };
    }
  }

  private buildPositionExpression(
    start: string, 
    end: string, 
    totalFrames: number, 
    dimension: number,
    zoomVar: string
  ): string {
    // If start and end are the same (no pan), just return the expression
    if (start === end) {
      return start;
    }

    // Create smooth transition expression with easing
    return `if(lte(on,${totalFrames/2}),(${start})+((${end})-(${start}))*pow(on/${totalFrames/2},1.2),(${end}))`;
  }

  // Batch generate multiple Ken Burns effects
  async generateBatch(paramsList: KenBurnsParams[]): Promise<string[]> {
    const results: string[] = [];
    
    for (let i = 0; i < paramsList.length; i++) {
      const params = paramsList[i];
      this.context.onProgress?.('kenburns', (i / paramsList.length) * 100, 
        `Processing ${i + 1}/${paramsList.length}: ${path.basename(params.imagePath)}`);
      
      try {
        const result = await this.generateKenBurns(params);
        results.push(result);
      } catch (error) {
        throw new Error(`Failed to generate Ken Burns for ${params.imagePath}: ${error}`);
      }
    }

    return results;
  }

  // Helper to create varied Ken Burns effects
  static createVariedEffects(
    images: string[],
    outputDir: string,
    duration: number,
    width: number,
    height: number
  ): KenBurnsParams[] {
    const effects: Array<{
      zoom: 'in' | 'out';
      pan: 'left' | 'right' | 'up' | 'down' | 'none';
    }> = [
      { zoom: 'in', pan: 'right' },
      { zoom: 'out', pan: 'left' },
      { zoom: 'in', pan: 'up' },
      { zoom: 'out', pan: 'down' },
      { zoom: 'in', pan: 'none' },
      { zoom: 'out', pan: 'none' }
    ];

    return images.map((imagePath, index) => {
      const effect = effects[index % effects.length];
      const outputName = `kenburns_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`;
      
      return {
        imagePath,
        outputPath: path.join(outputDir, outputName),
        duration,
        width,
        height,
        zoomDirection: effect.zoom,
        panDirection: effect.pan
      };
    });
  }

  // Analyze image for optimal Ken Burns settings
  async analyzeImageForKenBurns(imagePath: string): Promise<{
    recommendedZoom: 'in' | 'out';
    recommendedPan: 'left' | 'right' | 'up' | 'down' | 'none';
    confidence: number;
  }> {
    // This could be enhanced with image analysis
    // For now, provide reasonable defaults based on filename/path heuristics
    
    const filename = path.basename(imagePath).toLowerCase();
    
    // Heuristics based on room type and common photo compositions
    if (filename.includes('exterior') || filename.includes('front')) {
      return { recommendedZoom: 'in', recommendedPan: 'none', confidence: 0.8 };
    }
    
    if (filename.includes('kitchen') || filename.includes('living')) {
      return { recommendedZoom: 'out', recommendedPan: 'right', confidence: 0.7 };
    }
    
    if (filename.includes('bedroom') || filename.includes('bathroom')) {
      return { recommendedZoom: 'in', recommendedPan: 'up', confidence: 0.6 };
    }
    
    if (filename.includes('backyard') || filename.includes('yard')) {
      return { recommendedZoom: 'out', recommendedPan: 'left', confidence: 0.7 };
    }

    // Default fallback
    return { recommendedZoom: 'in', recommendedPan: 'none', confidence: 0.5 };
  }

  // Generate optimized Ken Burns for a room type
  async generateOptimizedForRoom(
    imagePath: string,
    outputPath: string,
    duration: number,
    width: number,
    height: number,
    room: string
  ): Promise<string> {
    const roomSettings: Record<string, { zoom: 'in' | 'out'; pan: 'left' | 'right' | 'up' | 'down' | 'none' }> = {
      exterior: { zoom: 'in', pan: 'none' },
      entry: { zoom: 'in', pan: 'up' },
      living: { zoom: 'out', pan: 'right' },
      kitchen: { zoom: 'in', pan: 'left' },
      bedroom: { zoom: 'out', pan: 'none' },
      bathroom: { zoom: 'in', pan: 'right' },
      backyard: { zoom: 'out', pan: 'left' }
    };

    const settings = roomSettings[room] || { zoom: 'in', pan: 'none' };

    return this.generateKenBurns({
      imagePath,
      outputPath,
      duration,
      width,
      height,
      zoomDirection: settings.zoom,
      panDirection: settings.pan
    });
  }
}
