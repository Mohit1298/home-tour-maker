export interface ImageInput {
  path: string;
  room?: string;
  captureTime?: Date;
}

export interface ListingData {
  headline?: string;
  bullets?: string[];
  address?: string;
}

export interface VoiceoverConfig {
  text?: string;
  voice?: string;
  speed?: number;
  pauseAfterSentence?: number;
}

export interface MusicConfig {
  path: string;
  duckUnderVOdB?: number;
  volume?: number;
}

export interface BrandConfig {
  logoPath?: string;
  primaryHex?: string;
  fontFamily?: string;
}

export interface OutputConfig {
  path: string;
  aspect: '16:9' | '9:16';
  resolution: '720p' | '1080p';
  targetSeconds: number;
  fps?: number;
}

export interface VeoConfig {
  projectId: string;
  location: string;
  model: 'veo-2.0-generate-001' | 'veo-2.0-generate-exp' | 'veo-3.0-generate-001' | 'veo-3.0-fast-generate-001' | 'veo-3.0-generate-preview';
  generateAudio?: boolean;
  bucketName?: string;
}

export interface HomeTourConfig {
  images: ImageInput[];
  listing?: ListingData;
  voiceover?: VoiceoverConfig;
  music?: MusicConfig;
  brand?: BrandConfig;
  output: OutputConfig;
  veo: VeoConfig;
  tmpDir?: string;
}

export interface Scene {
  id: string;
  room: string;
  images: ImageInput[];
  duration: number;
  type: 'veo' | 'kenburns';
  description?: string;
  focusPoints?: string[];
}

export interface ScenePlan {
  scenes: Scene[];
  totalDuration: number;
  veoSegments: number;
  kenBurnsSegments: number;
}

export interface VeoParams {
  projectId: string;
  location: string;
  model: string;
  aspect: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  duration: 4 | 6 | 8;
  generateAudio?: boolean;
  seed?: number;
  imageGcsUri: string;
  lastFrameGcsUri?: string;
  refImages?: Array<{
    gcsUri: string;
    mimeType: string;
    role: 'asset' | 'style';
  }>;
  storageUri?: string;
  prompt: string;
}

export interface VeoResult {
  videoPath: string;
  lastFramePath?: string;
  duration: number;
}

export interface KenBurnsParams {
  imagePath: string;
  outputPath: string;
  duration: number;
  width: number;
  height: number;
  zoomDirection?: 'in' | 'out';
  panDirection?: 'left' | 'right' | 'up' | 'down' | 'none';
}

export interface TTSParams {
  text: string;
  voice: string;
  speed: number;
  outputPath: string;
}

export interface VideoSegment {
  path: string;
  duration: number;
  type: 'veo' | 'kenburns';
  room: string;
  hasAudio: boolean;
}

export interface AudioTrack {
  path: string;
  type: 'voiceover' | 'music';
  volume: number;
  startTime: number;
  duration: number;
}

export interface AssemblyParams {
  segments: VideoSegment[];
  audioTracks: AudioTrack[];
  outputPath: string;
  crossfadeDuration: number;
  aspect: '16:9' | '9:16';
  resolution: '720p' | '1080p';
  fps: number;
}

export interface BrandingParams {
  logoPath?: string;
  primaryColor?: string;
  lowerThirds: Array<{
    text: string;
    startTime: number;
    duration: number;
  }>;
  endSlate?: {
    headline: string;
    address?: string;
    cta?: string;
    duration: number;
  };
}

export interface ProgressCallback {
  (phase: string, progress: number, message?: string): void;
}

export interface PipelineContext {
  config: HomeTourConfig;
  tmpDir: string;
  gcsBucket?: string;
  authToken?: string;
  onProgress?: ProgressCallback;
}

export interface CacheEntry {
  hash: string;
  inputHash: string;
  outputPath: string;
  lastUsed: Date;
  metadata?: any;
}

export interface Cache {
  get(key: string): CacheEntry | null;
  set(key: string, entry: CacheEntry): void;
  clear(): void;
  cleanup(maxAge: number): void;
}
