import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { VideoSegment, AudioTrack, AssemblyParams, PipelineContext } from '../types.js';

// Set ffmpeg path - disabled to use system FFmpeg due to concat filter bug in ffmpeg-static
// ffmpeg.setFfmpegPath(ffmpegPath!);

export interface AssemblyOptions {
  codec?: string;
  crf?: number;
  preset?: string;
  audioCodec?: string;
  audioBitrate?: string;
  pixelFormat?: string;
}

export class VideoAssembler {
  private context: PipelineContext;
  private options: Required<AssemblyOptions>;

  constructor(context: PipelineContext, options: AssemblyOptions = {}) {
    this.context = context;
    this.options = {
      codec: options.codec ?? 'libx264',
      crf: options.crf ?? 20,
      preset: options.preset ?? 'medium',
      audioCodec: options.audioCodec ?? 'aac',
      audioBitrate: options.audioBitrate ?? '192k',
      pixelFormat: options.pixelFormat ?? 'yuv420p'
    };
  }

  async assembleVideo(params: AssemblyParams): Promise<string> {
    this.context.onProgress?.('assembly', 0, 'Preparing video assembly');

    // Validate inputs
    await this.validateInputs(params);

    // Create temporary files
    const tempDir = path.dirname(params.outputPath);
    const concatListPath = path.join(tempDir, `concat_${Date.now()}.txt`);
    const tempVideoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);

    try {
      this.context.onProgress?.('assembly', 10, 'Creating video timeline');

      // Step 1: Create video timeline with crossfades
      await this.createVideoTimeline(params.segments, tempVideoPath, params);

      this.context.onProgress?.('assembly', 60, 'Processing audio tracks');

      // Step 2: Create and mix audio
      const audioPath = await this.createAudioMix(params.audioTracks, tempDir);

      this.context.onProgress?.('assembly', 85, 'Combining video and audio');

      // Step 3: Combine video and audio
      await this.combineVideoAndAudio(tempVideoPath, audioPath, params.outputPath, params);

      this.context.onProgress?.('assembly', 100, 'Video assembly complete');

      return params.outputPath;

    } finally {
      // Cleanup temporary files
      await this.cleanup([concatListPath, tempVideoPath]);
    }
  }

  private async validateInputs(params: AssemblyParams): Promise<void> {
    // Check output directory exists
    await fs.promises.mkdir(path.dirname(params.outputPath), { recursive: true });

    // Validate video segments
    for (const segment of params.segments) {
      if (!fs.existsSync(segment.path)) {
        throw new Error(`Video segment not found: ${segment.path}`);
      }
    }

    // Validate audio tracks
    for (const track of params.audioTracks) {
      if (!fs.existsSync(track.path)) {
        throw new Error(`Audio track not found: ${track.path}`);
      }
    }
  }

  private async createVideoTimeline(
    segments: VideoSegment[], 
    outputPath: string, 
    params: AssemblyParams
  ): Promise<void> {
    
    console.log(`[DEBUG] Processing ${segments.length} segments with durations:`, segments.map(s => s.duration));
    
    if (segments.length === 1) {
      // Single segment, just copy with proper encoding
      return this.processSingleSegment(segments[0], outputPath, params);
    }

    // Multiple segments with concatenation
    return this.createCrossfadeTimeline(segments, outputPath, params);
  }

  private async processSingleSegment(
    segment: VideoSegment, 
    outputPath: string, 
    params: AssemblyParams
  ): Promise<void> {
    
    return new Promise<void>((resolve, reject) => {
      const { width, height } = this.getResolutionDimensions(params.resolution);
      
      ffmpeg(segment.path)
        .outputOptions([
          `-c:v ${this.options.codec}`,
          `-crf ${this.options.crf}`,
          `-preset ${this.options.preset}`,
          `-pix_fmt ${this.options.pixelFormat}`,
          `-r ${params.fps}`,
          `-s ${width}x${height}`,
          '-movflags +faststart'
        ])
        .on('progress', (progress) => {
          const percent = Math.min(50, (progress.percent || 0) * 0.5);
          this.context.onProgress?.('assembly', 10 + percent, 'Processing video segment');
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error))
        .save(outputPath);
    });
  }

  private async createCrossfadeTimeline(
    segments: VideoSegment[], 
    outputPath: string, 
    params: AssemblyParams
  ): Promise<void> {
    
    const { crossfadeDuration } = params;
    const { width, height } = this.getResolutionDimensions(params.resolution);

    // Use manual file list approach to avoid fluent-ffmpeg concat filter bug
    return this.createConcatFileApproach(segments, outputPath, params);
  }

  private async createConcatFileApproach(
    segments: VideoSegment[], 
    outputPath: string, 
    params: AssemblyParams
  ): Promise<void> {
    
    // Create concat file list
    const concatFilePath = path.join(path.dirname(outputPath), 'concat_list.txt');
    const concatContent = segments
      .map(segment => `file '${path.resolve(segment.path)}'`)
      .join('\n');
    
    await fs.promises.writeFile(concatFilePath, concatContent);
    
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          `-c:v ${this.options.codec}`,
          `-crf ${this.options.crf}`,
          `-preset ${this.options.preset}`,
          '-movflags +faststart'
        ])
        .on('progress', (progress) => {
          const percent = Math.min(50, (progress.percent || 0) * 0.5);
          this.context.onProgress?.('assembly', 10 + percent, 'Concatenating video segments');
        })
        .on('end', async () => {
          // Cleanup concat file
          try {
            await fs.promises.unlink(concatFilePath);
          } catch (e) {
            // Ignore cleanup errors
          }
          resolve();
        })
        .on('error', async (error) => {
          // Cleanup concat file
          try {
            await fs.promises.unlink(concatFilePath);
          } catch (e) {
            // Ignore cleanup errors
          }
          reject(error);
        })
        .save(outputPath);
    });
  }

  private buildCrossfadeFilter(segments: VideoSegment[], crossfadeDuration: number): string[] {
    const filters: string[] = [];
    let currentLabel = '0:v';

    // Scale all inputs to consistent size first
    segments.forEach((segment, index) => {
      filters.push(`[${index}:v]scale=1920:1080,setsar=1[v${index}]`);
    });

    // Create crossfades between consecutive segments
    for (let i = 0; i < segments.length - 1; i++) {
      const inputA = i === 0 ? `v${i}` : `xfade${i - 1}`;
      const inputB = `v${i + 1}`;
      const outputLabel = `xfade${i}`;

      // Calculate offset - where the crossfade should start
      const segmentDuration = segments[i].duration;
      const offset = Math.max(0, segmentDuration - crossfadeDuration);

      filters.push(
        `[${inputA}][${inputB}]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset}[${outputLabel}]`
      );
    }

    // Final output
    const finalLabel = segments.length > 1 ? `xfade${segments.length - 2}` : 'v0';
    if (finalLabel !== 'final_video') {
      filters.push(`[${finalLabel}]copy[final_video]`);
    }

    return filters;
  }

  private async createAudioMix(audioTracks: AudioTrack[], tempDir: string): Promise<string> {
    if (audioTracks.length === 0) {
      return ''; // No audio
    }

    if (audioTracks.length === 1) {
      return audioTracks[0].path; // Single track, no mixing needed
    }

    // Mix multiple audio tracks
    const mixedAudioPath = path.join(tempDir, `mixed_audio_${Date.now()}.mp3`);
    
    return new Promise<string>((resolve, reject) => {
      const command = ffmpeg();

      // Add all audio inputs
      audioTracks.forEach(track => {
        command.input(track.path);
      });

      // Build audio filter for mixing
      const audioFilter = this.buildAudioMixFilter(audioTracks);

      command
        .complexFilter(audioFilter, 'mixed_audio')
        .outputOptions([
          `-c:a ${this.options.audioCodec}`,
          `-b:a ${this.options.audioBitrate}`,
          '-ac 2' // Stereo output
        ])
        .on('progress', (progress) => {
          const percent = Math.min(25, (progress.percent || 0) * 0.25);
          this.context.onProgress?.('assembly', 60 + percent, 'Mixing audio tracks');
        })
        .on('end', () => resolve(mixedAudioPath))
        .on('error', reject)
        .save(mixedAudioPath);
    });
  }

  private buildAudioMixFilter(audioTracks: AudioTrack[]): string[] {
    const filters: string[] = [];

    // Process each track (volume, timing)
    audioTracks.forEach((track, index) => {
      let filterChain = `[${index}:a]`;

      // Apply volume adjustment
      if (track.volume !== 1.0) {
        filterChain += `volume=${track.volume}`;
      }

      // Apply start time delay if needed
      if (track.startTime > 0) {
        if (track.volume !== 1.0) filterChain += ',';
        filterChain += `adelay=${Math.round(track.startTime * 1000)}|${Math.round(track.startTime * 1000)}`;
      }

      filterChain += `[a${index}]`;
      filters.push(filterChain);
    });

    // Mix all processed tracks
    const inputLabels = audioTracks.map((_, index) => `[a${index}]`).join('');
    filters.push(`${inputLabels}amix=inputs=${audioTracks.length}:duration=longest[mixed_audio]`);

    return filters;
  }

  private async combineVideoAndAudio(
    videoPath: string, 
    audioPath: string, 
    outputPath: string, 
    params: AssemblyParams
  ): Promise<void> {
    
    return new Promise<void>((resolve, reject) => {
      const command = ffmpeg()
        .input(videoPath)
        .videoCodec('copy'); // Copy video stream as-is

      if (audioPath) {
        command
          .input(audioPath)
          .audioCodec(this.options.audioCodec)
          .audioBitrate(this.options.audioBitrate);
      } else {
        command.noAudio();
      }

      command
        .outputOptions(['-movflags +faststart'])
        .on('progress', (progress) => {
          const percent = Math.min(15, (progress.percent || 0) * 0.15);
          this.context.onProgress?.('assembly', 85 + percent, 'Finalizing video');
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error))
        .save(outputPath);
    });
  }

  private getResolutionDimensions(resolution: '720p' | '1080p'): { width: number; height: number } {
    switch (resolution) {
      case '720p':
        return { width: 1280, height: 720 };
      case '1080p':
        return { width: 1920, height: 1080 };
      default:
        return { width: 1920, height: 1080 };
    }
  }

  // Helper method for adding lower-thirds and branding overlays
  async addOverlays(
    inputPath: string,
    outputPath: string,
    overlays: Array<{
      type: 'text' | 'image';
      content: string;
      startTime: number;
      duration: number;
      position: { x: number; y: number };
      fontSize?: number;
      fontColor?: string;
      backgroundColor?: string;
    }>
  ): Promise<string> {
    
    if (overlays.length === 0) {
      // No overlays, just copy
      await fs.promises.copyFile(inputPath, outputPath);
      return outputPath;
    }

    return new Promise<string>((resolve, reject) => {
      const filterComplex: string[] = [];
      let currentLabel = '0:v';

      overlays.forEach((overlay, index) => {
        const nextLabel = `overlay${index}`;
        
        if (overlay.type === 'text') {
          const textFilter = this.buildTextOverlayFilter(
            currentLabel, 
            overlay, 
            nextLabel
          );
          filterComplex.push(textFilter);
        } else if (overlay.type === 'image') {
          // Image overlay would require additional input
          // Implementation depends on specific requirements
        }
        
        currentLabel = nextLabel;
      });

      ffmpeg(inputPath)
        .complexFilter(filterComplex, currentLabel)
        .outputOptions([
          `-c:v ${this.options.codec}`,
          `-crf ${this.options.crf}`,
          '-movflags +faststart'
        ])
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  private buildTextOverlayFilter(
    inputLabel: string,
    overlay: {
      content: string;
      startTime: number;
      duration: number;
      position: { x: number; y: number };
      fontSize?: number;
      fontColor?: string;
      backgroundColor?: string;
    },
    outputLabel: string
  ): string {
    
    const fontSize = overlay.fontSize || 24;
    const fontColor = overlay.fontColor || 'white';
    const backgroundColor = overlay.backgroundColor || 'black@0.7';
    
    let filter = `[${inputLabel}]drawtext=`;
    filter += `text='${overlay.content.replace(/'/g, "\\'")}':`;
    filter += `fontsize=${fontSize}:`;
    filter += `fontcolor=${fontColor}:`;
    filter += `x=${overlay.position.x}:`;
    filter += `y=${overlay.position.y}:`;
    filter += `box=1:boxcolor=${backgroundColor}:boxborderw=10:`;
    filter += `enable='between(t,${overlay.startTime},${overlay.startTime + overlay.duration})'`;
    filter += `[${outputLabel}]`;

    return filter;
  }

  // Utility method for batch processing multiple videos
  async assembleMultipleVideos(
    paramsList: AssemblyParams[]
  ): Promise<string[]> {
    const results: string[] = [];
    
    for (let i = 0; i < paramsList.length; i++) {
      const params = paramsList[i];
      this.context.onProgress?.('assembly', (i / paramsList.length) * 100, 
        `Assembling video ${i + 1}/${paramsList.length}`);
      
      const result = await this.assembleVideo(params);
      results.push(result);
    }

    return results;
  }

  // Clean up temporary files
  private async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Failed to cleanup ${filePath}:`, error);
      }
    }
  }

  // Generate video information/metadata
  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    hasAudio: boolean;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        resolve({
          duration: parseFloat(String(metadata.format.duration || '0')),
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: this.parseFPS(videoStream.r_frame_rate || '24/1'),
          bitrate: parseInt(String(metadata.format.bit_rate || '0')),
          hasAudio: !!audioStream
        });
      });
    });
  }

  private parseFPS(fpsString: string): number {
    const [num, den] = fpsString.split('/').map(Number);
    return den ? num / den : num;
  }
}
