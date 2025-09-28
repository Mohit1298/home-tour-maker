import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { BrandingParams, BrandConfig, PipelineContext } from '../types.js';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath!);

export interface BrandingOptions {
  defaultFont?: string;
  safeMarginPercent?: number;
  logoOpacity?: number;
  textBackgroundOpacity?: number;
}

export interface LowerThird {
  text: string;
  startTime: number;
  duration: number;
  position?: 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-left' | 'top-center' | 'top-right';
  style?: 'minimal' | 'bar' | 'badge';
}

export interface EndSlate {
  headline: string;
  subtitle?: string;
  address?: string;
  cta?: string;
  duration: number;
  logoPath?: string;
  backgroundColor?: string;
  textColor?: string;
}

export class BrandingProcessor {
  private context: PipelineContext;
  private options: Required<BrandingOptions>;

  constructor(context: PipelineContext, options: BrandingOptions = {}) {
    this.context = context;
    this.options = {
      defaultFont: options.defaultFont ?? 'Arial',
      safeMarginPercent: options.safeMarginPercent ?? 5,
      logoOpacity: options.logoOpacity ?? 0.9,
      textBackgroundOpacity: options.textBackgroundOpacity ?? 0.8
    };
  }

  async applyBranding(
    inputVideoPath: string,
    outputVideoPath: string,
    brandConfig: BrandConfig,
    lowerThirds: LowerThird[],
    endSlate?: EndSlate
  ): Promise<string> {

    this.context.onProgress?.('branding', 0, 'Preparing branding elements');

    // Create temporary files for processing steps
    const tempDir = path.dirname(outputVideoPath);
    const tempWithLowerThirds = path.join(tempDir, `temp_lowerthirds_${Date.now()}.mp4`);
    const tempWithLogo = path.join(tempDir, `temp_logo_${Date.now()}.mp4`);

    try {
      // Step 1: Add lower thirds
      let currentVideo = inputVideoPath;
      if (lowerThirds.length > 0) {
        this.context.onProgress?.('branding', 25, 'Adding lower thirds');
        await this.addLowerThirds(currentVideo, tempWithLowerThirds, lowerThirds, brandConfig);
        currentVideo = tempWithLowerThirds;
      }

      // Step 2: Add logo watermark
      if (brandConfig.logoPath && fs.existsSync(brandConfig.logoPath)) {
        this.context.onProgress?.('branding', 50, 'Adding logo watermark');
        await this.addLogoWatermark(currentVideo, tempWithLogo, brandConfig);
        currentVideo = tempWithLogo;
      }

      // Step 3: Add end slate
      if (endSlate) {
        this.context.onProgress?.('branding', 75, 'Creating end slate');
        await this.addEndSlate(currentVideo, outputVideoPath, endSlate);
      } else {
        // Just copy the current video to output
        await fs.promises.copyFile(currentVideo, outputVideoPath);
      }

      this.context.onProgress?.('branding', 100, 'Branding complete');

      return outputVideoPath;

    } finally {
      // Cleanup temporary files
      await this.cleanup([tempWithLowerThirds, tempWithLogo]);
    }
  }

  private async addLowerThirds(
    inputPath: string,
    outputPath: string,
    lowerThirds: LowerThird[],
    brandConfig: BrandConfig
  ): Promise<void> {

    const filterComplex: string[] = [];
    let currentLabel = '0:v';

    // Get video dimensions for positioning calculations
    const videoInfo = await this.getVideoInfo(inputPath);
    const safeMargin = Math.floor((videoInfo.width * this.options.safeMarginPercent) / 100);

    lowerThirds.forEach((lowerThird, index) => {
      const nextLabel = `lt${index}`;
      const position = this.calculateLowerThirdPosition(
        lowerThird.position || 'bottom-left',
        videoInfo.width,
        videoInfo.height,
        safeMargin
      );

      const textFilter = this.buildLowerThirdFilter(
        currentLabel,
        lowerThird,
        position,
        brandConfig,
        nextLabel
      );

      filterComplex.push(textFilter);
      currentLabel = nextLabel;
    });

    return new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .complexFilter(filterComplex, currentLabel)
        .outputOptions([
          '-c:v libx264',
          '-crf 18',
          '-preset medium',
          '-pix_fmt yuv420p',
          '-movflags +faststart'
        ])
        .on('end', () => resolve())
        .on('error', (error) => reject(error))
        .save(outputPath);
    });
  }

  private buildLowerThirdFilter(
    inputLabel: string,
    lowerThird: LowerThird,
    position: { x: number; y: number },
    brandConfig: BrandConfig,
    outputLabel: string
  ): string {

    const primaryColor = brandConfig.primaryHex || '#FFFFFF';
    const backgroundColor = this.hexToFFmpegColor(primaryColor, this.options.textBackgroundOpacity);
    const textColor = this.getContrastingColor(primaryColor);

    let filter = `[${inputLabel}]`;

    // Different styles for lower thirds
    switch (lowerThird.style || 'bar') {
      case 'minimal':
        filter += this.buildMinimalLowerThird(lowerThird, position, textColor);
        break;
      case 'badge':
        filter += this.buildBadgeLowerThird(lowerThird, position, backgroundColor, textColor);
        break;
      case 'bar':
      default:
        filter += this.buildBarLowerThird(lowerThird, position, backgroundColor, textColor);
        break;
    }

    filter += `[${outputLabel}]`;
    return filter;
  }

  private buildBarLowerThird(
    lowerThird: LowerThird,
    position: { x: number; y: number },
    backgroundColor: string,
    textColor: string
  ): string {

    const fontSize = 32;
    const padding = 20;
    
    return `drawtext=` +
      `text='${this.escapeText(lowerThird.text)}':` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `fontsize=${fontSize}:` +
      `fontcolor=${textColor}:` +
      `x=${position.x}:` +
      `y=${position.y}:` +
      `box=1:` +
      `boxcolor=${backgroundColor}:` +
      `boxborderw=${padding}:` +
      `enable='between(t,${lowerThird.startTime},${lowerThird.startTime + lowerThird.duration})'`;
  }

  private buildMinimalLowerThird(
    lowerThird: LowerThird,
    position: { x: number; y: number },
    textColor: string
  ): string {

    const fontSize = 28;
    
    return `drawtext=` +
      `text='${this.escapeText(lowerThird.text)}':` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `fontsize=${fontSize}:` +
      `fontcolor=${textColor}:` +
      `x=${position.x}:` +
      `y=${position.y}:` +
      `shadowcolor=black@0.8:` +
      `shadowx=2:` +
      `shadowy=2:` +
      `enable='between(t,${lowerThird.startTime},${lowerThird.startTime + lowerThird.duration})'`;
  }

  private buildBadgeLowerThird(
    lowerThird: LowerThird,
    position: { x: number; y: number },
    backgroundColor: string,
    textColor: string
  ): string {

    const fontSize = 24;
    const padding = 15;
    
    return `drawtext=` +
      `text='${this.escapeText(lowerThird.text)}':` +
      `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
      `fontsize=${fontSize}:` +
      `fontcolor=${textColor}:` +
      `x=${position.x}:` +
      `y=${position.y}:` +
      `box=1:` +
      `boxcolor=${backgroundColor}:` +
      `boxborderw=${padding}:` +
      `enable='between(t,${lowerThird.startTime},${lowerThird.startTime + lowerThird.duration})'`;
  }

  private calculateLowerThirdPosition(
    position: string,
    videoWidth: number,
    videoHeight: number,
    safeMargin: number
  ): { x: number; y: number } {

    const positions = {
      'bottom-left': { x: safeMargin, y: videoHeight - 120 },
      'bottom-center': { x: videoWidth / 2, y: videoHeight - 120 },
      'bottom-right': { x: videoWidth - safeMargin, y: videoHeight - 120 },
      'top-left': { x: safeMargin, y: safeMargin + 60 },
      'top-center': { x: videoWidth / 2, y: safeMargin + 60 },
      'top-right': { x: videoWidth - safeMargin, y: safeMargin + 60 }
    };

    return positions[position as keyof typeof positions] || positions['bottom-left'];
  }

  private async addLogoWatermark(
    inputPath: string,
    outputPath: string,
    brandConfig: BrandConfig
  ): Promise<void> {

    if (!brandConfig.logoPath || !fs.existsSync(brandConfig.logoPath)) {
      await fs.promises.copyFile(inputPath, outputPath);
      return;
    }

    const videoInfo = await this.getVideoInfo(inputPath);
    const logoSize = Math.floor(videoInfo.width * 0.15); // 15% of video width
    const safeMargin = Math.floor((videoInfo.width * this.options.safeMarginPercent) / 100);

    return new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .input(brandConfig.logoPath!)
        .complexFilter([
          `[1:v]scale=${logoSize}:-1[logo]`,
          `[0:v][logo]overlay=${videoInfo.width - logoSize - safeMargin}:${safeMargin}:` +
          `format=auto:shortest=1:enable='gte(t,1)'[output]`
        ], 'output')
        .outputOptions([
          '-c:v libx264',
          '-crf 18',
          '-preset medium',
          '-pix_fmt yuv420p',
          '-movflags +faststart'
        ])
        .on('end', () => resolve())
        .on('error', (error) => reject(error))
        .save(outputPath);
    });
  }

  private async addEndSlate(
    inputPath: string,
    outputPath: string,
    endSlate: EndSlate
  ): Promise<void> {

    // Create end slate video
    const tempDir = path.dirname(outputPath);
    const endSlateVideoPath = path.join(tempDir, `endslate_${Date.now()}.mp4`);

    try {
      await this.createEndSlateVideo(endSlateVideoPath, endSlate);

      // Concatenate with main video
      await this.concatenateVideos([inputPath, endSlateVideoPath], outputPath);

    } finally {
      // Cleanup end slate video
      await this.cleanup([endSlateVideoPath]);
    }
  }

  private async createEndSlateVideo(
    outputPath: string,
    endSlate: EndSlate
  ): Promise<void> {

    const backgroundColor = endSlate.backgroundColor || '#000000';
    const textColor = endSlate.textColor || '#FFFFFF';
    const videoWidth = 1920;
    const videoHeight = 1080;

    return new Promise<void>((resolve, reject) => {
      let filterComplex = `color=c=${backgroundColor}:s=${videoWidth}x${videoHeight}:d=${endSlate.duration}[bg];`;

      // Add headline
      filterComplex += `[bg]drawtext=` +
        `text='${this.escapeText(endSlate.headline)}':` +
        `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
        `fontsize=72:` +
        `fontcolor=${textColor}:` +
        `x=(w-text_w)/2:` +
        `y=h/2-100[headline];`;

      // Add subtitle if provided
      if (endSlate.subtitle) {
        filterComplex += `[headline]drawtext=` +
          `text='${this.escapeText(endSlate.subtitle)}':` +
          `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
          `fontsize=36:` +
          `fontcolor=${textColor}:` +
          `x=(w-text_w)/2:` +
          `y=h/2-20[subtitle];`;
      }

      // Add address if provided
      if (endSlate.address) {
        const prevLabel = endSlate.subtitle ? 'subtitle' : 'headline';
        filterComplex += `[${prevLabel}]drawtext=` +
          `text='${this.escapeText(endSlate.address)}':` +
          `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
          `fontsize=32:` +
          `fontcolor=${textColor}:` +
          `x=(w-text_w)/2:` +
          `y=h/2+40[address];`;
      }

      // Add CTA if provided
      if (endSlate.cta) {
        const prevLabel = endSlate.address ? 'address' : endSlate.subtitle ? 'subtitle' : 'headline';
        filterComplex += `[${prevLabel}]drawtext=` +
          `text='${this.escapeText(endSlate.cta)}':` +
          `fontfile=/System/Library/Fonts/Helvetica.ttc:` +
          `fontsize=28:` +
          `fontcolor=${textColor}:` +
          `x=(w-text_w)/2:` +
          `y=h/2+120[final];`;
      }

      const finalLabel = endSlate.cta ? 'final' : 
                        endSlate.address ? 'address' : 
                        endSlate.subtitle ? 'subtitle' : 'headline';

      ffmpeg()
        .input(`color=c=${backgroundColor}:s=${videoWidth}x${videoHeight}:d=${endSlate.duration}`)
        .inputFormat('lavfi')
        .complexFilter(filterComplex, finalLabel)
        .outputOptions([
          '-c:v libx264',
          '-crf 18',
          '-preset medium',
          '-pix_fmt yuv420p',
          '-r 24'
        ])
        .on('end', () => resolve())
        .on('error', (error) => reject(error))
        .save(outputPath);
    });
  }

  private async concatenateVideos(inputPaths: string[], outputPath: string): Promise<void> {
    const concatListPath = path.join(path.dirname(outputPath), `concat_${Date.now()}.txt`);
    
    try {
      // Create concat file
      const concatContent = inputPaths.map(p => `file '${p}'`).join('\n');
      await fs.promises.writeFile(concatListPath, concatContent);

      return new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions([
            '-c:v libx264',
            '-crf 18',
            '-preset medium',
            '-pix_fmt yuv420p',
            '-movflags +faststart'
          ])
          .on('end', () => resolve())
          .on('error', (error) => reject(error))
          .save(outputPath);
      });

    } finally {
      await this.cleanup([concatListPath]);
    }
  }

  // Utility methods
  private hexToFFmpegColor(hex: string, opacity: number = 1): string {
    // Convert #RRGGBB to FFmpeg color format
    const color = hex.replace('#', '');
    const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return `0x${color}${alpha}`;
  }

  private getContrastingColor(hex: string): string {
    // Simple contrast calculation
    const color = hex.replace('#', '');
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5 ? 'black' : 'white';
  }

  private escapeText(text: string): string {
    return text
      .replace(/'/g, "\\'")
      .replace(/:/g, "\\:")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  private async getVideoInfo(videoPath: string): Promise<{
    width: number;
    height: number;
    duration: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        resolve({
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          duration: parseFloat(String(metadata.format.duration || '0'))
        });
      });
    });
  }

  private async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  // Helper to generate room-specific lower thirds
  static generateRoomLowerThirds(
    rooms: string[],
    segmentDurations: number[],
    style: 'minimal' | 'bar' | 'badge' = 'bar'
  ): LowerThird[] {
    const roomLabels: Record<string, string> = {
      exterior: 'Exterior',
      entry: 'Entryway',
      living: 'Living Room',
      kitchen: 'Kitchen',
      bedroom: 'Bedroom',
      bathroom: 'Bathroom',
      backyard: 'Backyard'
    };

    let currentTime = 0;
    const lowerThirds: LowerThird[] = [];

    rooms.forEach((room, index) => {
      const duration = segmentDurations[index] || 6;
      const label = roomLabels[room] || room.charAt(0).toUpperCase() + room.slice(1);

      lowerThirds.push({
        text: label,
        startTime: currentTime + 1, // Start 1 second into the segment
        duration: 3, // Show for 3 seconds
        position: 'bottom-left',
        style
      });

      currentTime += duration;
    });

    return lowerThirds;
  }
}
