# Home Tour Maker

AI-powered home tour video generator using Google's Veo AI model. Transform a series of home images into professional video tours with smooth transitions and intelligent camera movements.

## Features

- 🎥 **AI Video Generation**: Uses Google Veo AI to create smooth video transitions between images
- 🏠 **Optimized for Real Estate**: Specialized prompts and settings for home tours
- ⚡ **Fast Processing**: Veo 3.0 Fast model for quick video generation
- 🎛️ **Flexible Configuration**: Customizable duration, quality, and output settings
- 🔄 **Batch Processing**: Process multiple images automatically
- 🎵 **Audio Support**: Optional audio generation with video
- 📦 **Multiple Interfaces**: CLI tool, HTTP API, and direct function calls
- 🌐 **Cloud Integration**: Google Cloud Storage and Vertex AI integration

## Quick Start

### Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Node.js** 18+ installed
3. **FFmpeg** installed on your system

### Installation

```bash
npm install @your-scope/home-tour-maker
```

### Setup Google Cloud

1. Create a Google Cloud project
2. Enable required APIs:
   ```bash
   gcloud services enable aiplatform.googleapis.com
   gcloud services enable storage-component.googleapis.com
   gcloud services enable texttospeech.googleapis.com
   ```

3. Create a service account and download credentials:
   ```bash
   gcloud iam service-accounts create home-tour-maker
   gcloud iam service-accounts keys create credentials.json \
     --iam-account=home-tour-maker@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

4. Grant necessary permissions:
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:home-tour-maker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:home-tour-maker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/storage.admin"
   ```

5. Set up authentication:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
   ```

### Environment Configuration

Create a `.env` file in your project:

```env
# Google Cloud Configuration
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/credentials.json
GCS_BUCKET_NAME=your-bucket-name

# Veo Configuration
VEO_PROJECT=your-google-cloud-project-id
VEO_LOCATION=us-central1
VEO_MODEL=veo-3.0-fast-generate-001

# Optional: Text-to-Speech
TTS_VOICE_NAME=en-US-Journey-F
```

## Usage

### Command Line Interface

```bash
# Basic usage
npx home-tour-maker generate \
  --images ./photos \
  --out ./tour.mp4 \
  --seconds 44 \
  --veo-project your-project-id

# With custom settings
npx home-tour-maker generate \
  --images ./photos \
  --out ./tour.mp4 \
  --seconds 60 \
  --veo-project your-project-id \
  --veo-model veo-3.0-fast-generate-001 \
  --width 1920 \
  --height 1080
```

### HTTP API Server

Start the built-in API server:

```bash
npx home-tour-maker serve --port 3000 --cors
```

API endpoints:
- `GET /health` - Health check
- `GET /api/voices` - List available TTS voices
- `POST /api/validate` - Validate configuration
- `POST /api/generate` - Generate video (returns job ID)
- `GET /api/jobs/:id` - Get job status
- `GET /api/jobs` - List all jobs

### Direct API Usage

```javascript
import { makeHomeTour, queueHomeTourGeneration } from '@your-scope/home-tour-maker';

// Direct generation
const result = await makeHomeTour({
  images: ['./photo1.jpg', './photo2.jpg', './photo3.jpg'],
  output: {
    path: './tour.mp4',
    duration: 44,
    width: 1920,
    height: 1080
  },
  veo: {
    projectId: 'your-project-id',
    location: 'us-central1',
    model: 'veo-3.0-fast-generate-001',
    bucketName: 'your-bucket'
  }
});

// Async job queue
const jobId = await queueHomeTourGeneration(config);
const status = getJobStatus(jobId);
```

## Configuration Options

### Image Requirements

- **Formats**: JPG, JPEG, PNG, WebP
- **Aspect Ratio**: Automatically cropped to 16:9 for video compatibility
- **Recommended**: High resolution (1080p or higher)
- **Naming**: Numeric suffixes for proper ordering (e.g., `room_1.jpg`, `room_2.jpg`)

### Video Settings

```javascript
const config = {
  output: {
    duration: 44,        // Total video duration in seconds
    width: 1920,         // Output width
    height: 1080,        // Output height
    fps: 30,             // Frames per second
    quality: 'high',     // 'low', 'medium', 'high'
    aspect: '16:9'       // Aspect ratio
  },
  veo: {
    model: 'veo-3.0-fast-generate-001', // Veo model version
    generateAudio: false,                // Enable/disable audio
    location: 'us-central1',            // Google Cloud region
    bucketName: 'your-bucket'           // GCS bucket for temp files
  }
};
```

### Available Veo Models

- `veo-3.0-fast-generate-001` - Fastest generation, good quality
- `veo-3.0-generate-001` - Balanced speed and quality
- `veo-3.0-generate-preview` - Preview model with latest features
- `veo-2.0-generate-exp` - Experimental v2 model

## Image Processing

The system automatically:
1. **Sorts images** numerically by filename
2. **Crops to 16:9** aspect ratio if needed
3. **Processes individually** - each image becomes a 4-second video segment
4. **Generates smooth transitions** using Veo AI
5. **Concatenates segments** into final video

## Advanced Usage

### Custom Integration

```javascript
// Express.js integration
app.post('/generate-tour', async (req, res) => {
  const jobId = await queueHomeTourGeneration(req.body.config);
  res.json({ jobId });
});

// Next.js API route
export default async function handler(req, res) {
  const result = await makeHomeTour(req.body.config);
  res.json(result);
}
```

### Background Processing

```javascript
import { queueHomeTourGeneration, getJobStatus } from '@your-scope/home-tour-maker';

// Start job
const jobId = await queueHomeTourGeneration(config);

// Poll for completion
const checkStatus = setInterval(() => {
  const status = getJobStatus(jobId);
  if (status?.status === 'completed') {
    console.log('Video ready:', status.result.outputPath);
    clearInterval(checkStatus);
  }
}, 5000);
```

## Troubleshooting

### Common Issues

1. **Authentication Error**
   ```
   Error: No GCS bucket specified
   ```
   Solution: Set up `.env` file with Google Cloud credentials

2. **FFmpeg Not Found**
   ```
   Error: ffmpeg exited with code 1
   ```
   Solution: Install FFmpeg on your system

3. **Veo API Errors**
   ```
   Error: Failed to poll operation: 404
   ```
   Solution: Enable Vertex AI API in Google Cloud Console

4. **Image Count Mismatch**
   ```
   Error: Processing 12 images instead of 11
   ```
   Solution: Check for duplicate files or hidden system files

### Debug Mode

Enable detailed logging:

```bash
DEBUG=1 npx home-tour-maker generate --images ./photos --out ./tour.mp4
```

## API Reference

### Functions

#### `makeHomeTour(config: HomeTourConfig): Promise<HomeTourResult>`
Generate a home tour video synchronously.

#### `queueHomeTourGeneration(config: HomeTourConfig): Promise<string>`
Queue a home tour generation job, returns job ID.

#### `getJobStatus(jobId: string): JobStatus | null`
Get the status of a queued job.

#### `validateHomeTourConfig(config: HomeTourConfig): Promise<ValidationResult>`
Validate configuration before processing.

### Types

```typescript
interface HomeTourConfig {
  images: string[] | ImageInput[];
  output: OutputConfig;
  veo: VeoConfig;
  listing?: ListingData;
  tmpDir?: string;
}

interface OutputConfig {
  path: string;
  duration: number;
  width: number;
  height: number;
  fps?: number;
  quality?: 'low' | 'medium' | 'high';
  aspect?: string;
}

interface VeoConfig {
  projectId: string;
  location: string;
  model: string;
  bucketName: string;
  generateAudio?: boolean;
}
```

## Performance

- **Processing Time**: ~2-3 minutes per image with Veo 3.0 Fast
- **Memory Usage**: ~500MB-1GB during processing
- **Storage**: Temporary files stored in `.cache/` directory
- **Concurrency**: Processes images sequentially to respect API limits

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 **Issues**: [GitHub Issues](https://github.com/your-username/home-tour-maker/issues)
- 📚 **Documentation**: [Wiki](https://github.com/your-username/home-tour-maker/wiki)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/your-username/home-tour-maker/discussions)

## Changelog

### v1.0.0
- Initial release with Veo AI integration
- CLI tool and HTTP API
- Single image processing mode
- Automatic image sorting and cropping
- Google Cloud integration

---

**Made with ❤️ for real estate professionals and content creators**