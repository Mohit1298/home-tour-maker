import fs from 'fs';
import path from 'path';
import exifr from 'exifr';
import { ImageInput, PipelineContext } from '../types.js';

export interface IngestResult {
  images: ImageInput[];
  totalImages: number;
  roomDistribution: Record<string, number>;
  warnings: string[];
}

export class ImageIngestor {
  private context: PipelineContext;
  
  constructor(context: PipelineContext) {
    this.context = context;
  }

  async ingestImages(imagePaths: string[] | ImageInput[]): Promise<IngestResult> {
    this.context.onProgress?.('ingest', 0, 'Starting image ingestion');

    // Convert string paths to ImageInput objects
    const imageInputs: ImageInput[] = imagePaths.map(item => 
      typeof item === 'string' ? { path: item } : item
    );

    const warnings: string[] = [];
    const processedImages: ImageInput[] = [];

    for (let i = 0; i < imageInputs.length; i++) {
      const imageInput = imageInputs[i];
      this.context.onProgress?.('ingest', (i / imageInputs.length) * 80, 
        `Processing ${path.basename(imageInput.path)}`);

      try {
        const processed = await this.processImage(imageInput);
        if (processed) {
          processedImages.push(processed);
        }
      } catch (error) {
        warnings.push(`Failed to process ${imageInput.path}: ${error}`);
      }
    }

    this.context.onProgress?.('ingest', 85, 'Sorting images by capture time');

    // Sort by capture time
    processedImages.sort((a, b) => {
      if (!a.captureTime && !b.captureTime) return 0;
      if (!a.captureTime) return 1;
      if (!b.captureTime) return -1;
      return a.captureTime.getTime() - b.captureTime.getTime();
    });

    this.context.onProgress?.('ingest', 95, 'Validating image collection');

    // Validate collection
    const validation = this.validateImageCollection(processedImages);
    warnings.push(...validation.warnings);

    this.context.onProgress?.('ingest', 100, 'Image ingestion complete');

    return {
      images: processedImages,
      totalImages: processedImages.length,
      roomDistribution: this.calculateRoomDistribution(processedImages),
      warnings
    };
  }

  private async processImage(imageInput: ImageInput): Promise<ImageInput | null> {
    // Verify file exists
    if (!fs.existsSync(imageInput.path)) {
      throw new Error('File does not exist');
    }

    // Verify file type
    const ext = path.extname(imageInput.path).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      throw new Error('Unsupported file format');
    }

    // Get file stats
    const stats = fs.statSync(imageInput.path);
    if (stats.size === 0) {
      throw new Error('Empty file');
    }

    // Extract EXIF data for capture time
    let captureTime: Date | undefined;
    try {
      const exif = await exifr.parse(imageInput.path);
      if (exif?.DateTimeOriginal) {
        captureTime = new Date(exif.DateTimeOriginal);
      } else if (exif?.DateTime) {
        captureTime = new Date(exif.DateTime);
      }
    } catch (error) {
      // EXIF parsing failed, use file modification time as fallback
      captureTime = stats.mtime;
    }

    // Infer room if not provided
    const room = imageInput.room || this.inferRoom(imageInput.path);

    return {
      ...imageInput,
      captureTime: captureTime || stats.mtime,
      room
    };
  }

  private inferRoom(imagePath: string): string {
    const filename = path.basename(imagePath).toLowerCase();
    const dir = path.dirname(imagePath).toLowerCase();
    const fullPath = `${dir}/${filename}`;

    // Room inference rules based on filename/path patterns
    const roomPatterns = [
      { pattern: /(exterior|front|facade|curb|outside)/, room: 'exterior' },
      { pattern: /(entry|entryway|foyer|entrance|door)/, room: 'entry' },
      { pattern: /(living|family|great.room|lounge)/, room: 'living' },
      { pattern: /(kitchen|cook|dining)/, room: 'kitchen' },
      { pattern: /(master|bedroom|bed)/, room: 'bedroom' },
      { pattern: /(bathroom|bath|powder|ensuite)/, room: 'bathroom' },
      { pattern: /(backyard|back.yard|patio|deck|garden|yard)/, room: 'backyard' }
    ];

    for (const { pattern, room } of roomPatterns) {
      if (pattern.test(fullPath)) {
        return room;
      }
    }

    // Enhanced sequence-based inference for numbered files like "7e5f5_1.jpg"
    const sequenceMatch = filename.match(/_(\d+)\.jpg$/);
    if (sequenceMatch) {
      const num = parseInt(sequenceMatch[1]);
      return this.inferRoomBySequence(num);
    }

    // Fallback: any number in filename
    const simpleNumMatch = filename.match(/(\d+)/g);
    if (simpleNumMatch) {
      // Take the last number in the filename (most likely to be sequence number)
      const num = parseInt(simpleNumMatch[simpleNumMatch.length - 1]);
      return this.inferRoomBySequence(num);
    }

    return 'living'; // Default fallback
  }

  private inferRoomBySequence(num: number): string {
    // Common real estate photo sequence patterns
    if (num <= 2) return 'exterior';
    if (num <= 4) return 'entry';
    if (num <= 8) return 'living';
    if (num <= 12) return 'kitchen';
    if (num <= 16) return 'bedroom';
    if (num <= 18) return 'bathroom';
    return 'backyard';
  }

  private validateImageCollection(images: ImageInput[]): { warnings: string[] } {
    const warnings: string[] = [];

    // Check minimum/maximum count
    if (images.length < 6) {
      warnings.push(`Only ${images.length} images provided. Minimum 6 recommended for quality tours.`);
    }
    if (images.length > 40) {
      warnings.push(`${images.length} images provided. Maximum 40 recommended to avoid excessively long tours.`);
    }

    // Check room distribution
    const roomCounts = this.calculateRoomDistribution(images);
    
    if (!roomCounts.exterior || roomCounts.exterior === 0) {
      warnings.push('No exterior images found. Consider adding exterior shots for better tour flow.');
    }

    if (!roomCounts.living || roomCounts.living < 2) {
      warnings.push('Very few living area images. Consider adding more main living space photos.');
    }

    if (!roomCounts.kitchen || roomCounts.kitchen === 0) {
      warnings.push('No kitchen images found. Kitchen photos are important for home tours.');
    }

    // Check for image quality indicators
    const lowQualityImages = images.filter(img => {
      const stats = fs.statSync(img.path);
      return stats.size < 100000; // Less than 100KB might be low quality
    });

    if (lowQualityImages.length > 0) {
      warnings.push(`${lowQualityImages.length} images appear to be low quality (small file size).`);
    }

    return { warnings };
  }

  private calculateRoomDistribution(images: ImageInput[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const image of images) {
      const room = image.room || 'unknown';
      distribution[room] = (distribution[room] || 0) + 1;
    }

    return distribution;
  }

  // Helper method for directory-based ingestion
  async ingestFromDirectory(directoryPath: string, recursive = true): Promise<IngestResult> {
    const imageFiles = await this.findImageFiles(directoryPath, recursive);
    return this.ingestImages(imageFiles);
  }

  private async findImageFiles(directoryPath: string, recursive: boolean): Promise<string[]> {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const imageFiles: string[] = [];

    const processDirectory = async (dir: string): Promise<void> => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          await processDirectory(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (imageExtensions.includes(ext)) {
            imageFiles.push(fullPath);
          }
        }
      }
    };

    await processDirectory(directoryPath);
    return imageFiles.sort(); // Sort for consistent ordering
  }

  // Helper for validating against target duration
  validateForDuration(images: ImageInput[], targetSeconds: number): {
    canAchieveTarget: boolean;
    recommendedSettings: {
      veoSegments: number;
      kenBurnsSegments: number;
      averageImageDuration: number;
    };
    warnings: string[];
  } {
    const warnings: string[] = [];
    const maxVeoSegments = Math.floor(targetSeconds / 6); // Minimum 6s per Veo segment
    const availableVeoImages = Math.min(images.length, maxVeoSegments);
    const remainingTime = targetSeconds - (availableVeoImages * 6);
    const kenBurnsSegments = Math.max(0, Math.ceil(remainingTime / 4)); // 4s average per Ken Burns

    const totalPossibleDuration = (availableVeoImages * 6) + (kenBurnsSegments * 4);
    const canAchieveTarget = totalPossibleDuration >= targetSeconds * 0.9; // Within 10%

    if (!canAchieveTarget) {
      warnings.push(`Target duration ${targetSeconds}s may be difficult to achieve with ${images.length} images.`);
      warnings.push(`Consider reducing target to ~${Math.floor(totalPossibleDuration)}s or adding more images.`);
    }

    if (kenBurnsSegments > availableVeoImages) {
      warnings.push(`Will need ${kenBurnsSegments} Ken Burns segments vs ${availableVeoImages} Veo segments. Consider adding more images for better variety.`);
    }

    return {
      canAchieveTarget,
      recommendedSettings: {
        veoSegments: availableVeoImages,
        kenBurnsSegments,
        averageImageDuration: totalPossibleDuration / images.length
      },
      warnings
    };
  }
}
