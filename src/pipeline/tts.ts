import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import { TTSParams, VoiceoverConfig, PipelineContext } from '../types.js';

export interface TTSOptions {
  languageCode?: string;
  defaultVoice?: string;
  audioEncoding?: 'MP3' | 'WAV' | 'OGG_OPUS';
  speakingRate?: number;
  pitch?: number;
  volumeGainDb?: number;
  sampleRateHertz?: number;
}

export class TTSGenerator {
  private client: TextToSpeechClient;
  private context: PipelineContext;
  private options: Required<TTSOptions>;

  constructor(context: PipelineContext, options: TTSOptions = {}) {
    this.context = context;
    this.client = new TextToSpeechClient();
    this.options = {
      languageCode: options.languageCode ?? 'en-US',
      defaultVoice: options.defaultVoice ?? 'en-US-Neural2-D',
      audioEncoding: options.audioEncoding ?? 'MP3',
      speakingRate: options.speakingRate ?? 1.0,
      pitch: options.pitch ?? 0.0,
      volumeGainDb: options.volumeGainDb ?? 0.0,
      sampleRateHertz: options.sampleRateHertz ?? 22050
    };
  }

  async synthesizeVoiceover(params: TTSParams): Promise<string> {
    this.context.onProgress?.('tts', 0, 'Preparing text for synthesis');

    // Process text into SSML for better pacing
    const ssml = this.convertToSSML(params.text, params.speed);

    this.context.onProgress?.('tts', 25, 'Synthesizing speech');

    // Prepare TTS request
    const request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
      input: { ssml },
      voice: {
        languageCode: this.options.languageCode,
        name: params.voice || this.options.defaultVoice
      },
      audioConfig: {
        audioEncoding: this.options.audioEncoding as any,
        speakingRate: params.speed || this.options.speakingRate,
        pitch: this.options.pitch,
        volumeGainDb: this.options.volumeGainDb,
        sampleRateHertz: this.options.sampleRateHertz
      }
    };

    try {
      // Call TTS API
      const [response] = await this.client.synthesizeSpeech(request);

      this.context.onProgress?.('tts', 75, 'Saving audio file');

      // Ensure output directory exists
      await fs.promises.mkdir(path.dirname(params.outputPath), { recursive: true });

      // Save audio content
      if (response.audioContent) {
        await fs.promises.writeFile(params.outputPath, response.audioContent);
      } else {
        throw new Error('No audio content in TTS response');
      }

      this.context.onProgress?.('tts', 100, 'Voice synthesis complete');

      return params.outputPath;
    } catch (error) {
      throw new Error(`TTS synthesis failed: ${error}`);
    }
  }

  private convertToSSML(text: string, speed: number = 1.0): string {
    // Clean up text
    let processedText = text.trim();

    // Add proper pauses for natural speech pacing
    processedText = this.addNaturalPauses(processedText);

    // Build SSML with speak tags and rate adjustment
    let ssml = `<speak>`;
    
    // Add prosody for speaking rate if different from default
    if (speed !== 1.0) {
      const rate = speed > 1.0 ? 'fast' : speed < 0.8 ? 'slow' : 'medium';
      ssml += `<prosody rate="${rate}">`;
    }

    ssml += processedText;

    if (speed !== 1.0) {
      ssml += '</prosody>';
    }

    ssml += '</speak>';

    return ssml;
  }

  private addNaturalPauses(text: string): string {
    // Add breaks after sentences
    text = text.replace(/([.!?])\s+/g, '$1<break time="600ms"/>');
    
    // Add shorter breaks after commas
    text = text.replace(/,\s+/g, ',<break time="300ms"/>');
    
    // Add breaks before "Let's" or "Now" for tour transitions
    text = text.replace(/\b(Let's|Now|Next|Here's)\b/g, '<break time="400ms"/>$1');
    
    // Add emphasis on key real estate terms
    text = text.replace(/\b(kitchen|bedroom|bathroom|living room|backyard|master suite|chef's|spacious|luxury|premium|exceptional)\b/gi, 
      '<emphasis level="moderate">$1</emphasis>');

    return text;
  }

  // Generate voiceover from script with room-specific timing
  async generateVoiceoverWithTiming(
    script: string,
    roomTimings: Array<{ room: string; startTime: number; duration: number }>,
    outputPath: string,
    voice?: string,
    speed?: number
  ): Promise<{ audioPath: string; segments: Array<{ room: string; audioPath: string; duration: number }> }> {
    
    this.context.onProgress?.('tts', 0, 'Splitting script by room timing');

    // Split script into room segments
    const scriptSegments = this.splitScriptByRooms(script, roomTimings);
    const audioSegments: Array<{ room: string; audioPath: string; duration: number }> = [];

    // Generate audio for each segment
    for (let i = 0; i < scriptSegments.length; i++) {
      const segment = scriptSegments[i];
      const segmentPath = outputPath.replace('.mp3', `_${segment.room}_${i}.mp3`);
      
      this.context.onProgress?.('tts', (i / scriptSegments.length) * 80, 
        `Synthesizing ${segment.room} segment`);

      await this.synthesizeVoiceover({
        text: segment.text,
        voice: voice || this.options.defaultVoice,
        speed: speed || this.options.speakingRate,
        outputPath: segmentPath
      });

      audioSegments.push({
        room: segment.room,
        audioPath: segmentPath,
        duration: segment.targetDuration
      });
    }

    this.context.onProgress?.('tts', 90, 'Combining audio segments');

    // Combine all segments into final audio file
    await this.combineAudioSegments(audioSegments.map(s => s.audioPath), outputPath);

    this.context.onProgress?.('tts', 100, 'Voiceover generation complete');

    return {
      audioPath: outputPath,
      segments: audioSegments
    };
  }

  private splitScriptByRooms(
    script: string, 
    roomTimings: Array<{ room: string; startTime: number; duration: number }>
  ): Array<{ room: string; text: string; targetDuration: number }> {
    
    // Split script into sentences
    const sentences = script.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    
    // Estimate words per minute (typical TTS: ~150-180 WPM)
    const wordsPerSecond = 2.5;
    
    const segments: Array<{ room: string; text: string; targetDuration: number }> = [];
    
    for (const timing of roomTimings) {
      const targetWords = Math.floor(timing.duration * wordsPerSecond);
      
      // Find sentences that fit this timing
      let segmentText = '';
      let wordCount = 0;
      
      while (sentences.length > 0 && wordCount < targetWords) {
        const sentence = sentences.shift()!;
        const sentenceWords = sentence.split(/\s+/).length;
        
        if (wordCount + sentenceWords <= targetWords * 1.2) { // Allow 20% overage
          segmentText += (segmentText ? ' ' : '') + sentence;
          wordCount += sentenceWords;
        } else {
          // Put sentence back and break
          sentences.unshift(sentence);
          break;
        }
      }
      
      if (segmentText.trim()) {
        segments.push({
          room: timing.room,
          text: segmentText.trim(),
          targetDuration: timing.duration
        });
      }
    }
    
    // Handle any remaining sentences
    if (sentences.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) {
        lastSegment.text += ' ' + sentences.join(' ');
      }
    }
    
    return segments;
  }

  private async combineAudioSegments(segmentPaths: string[], outputPath: string): Promise<void> {
    // This would use ffmpeg to combine audio segments
    // For now, we'll use the first segment as the combined output
    // In a full implementation, you'd concatenate all segments with appropriate spacing
    
    if (segmentPaths.length > 0) {
      await fs.promises.copyFile(segmentPaths[0], outputPath);
    }
  }

  // Generate script from listing data and room information
  generateScript(
    rooms: string[],
    listingData?: {
      headline?: string;
      bullets?: string[];
      address?: string;
    },
    style: 'professional' | 'warm' | 'luxury' = 'professional'
  ): string {
    
    const scripts = {
      professional: this.generateProfessionalScript(rooms, listingData),
      warm: this.generateWarmScript(rooms, listingData),
      luxury: this.generateLuxuryScript(rooms, listingData)
    };

    return scripts[style];
  }

  private generateProfessionalScript(
    rooms: string[], 
    listingData?: { headline?: string; bullets?: string[]; address?: string }
  ): string {
    
    let script = '';

    // Opening
    if (listingData?.headline) {
      script += `Welcome to ${listingData.headline}. `;
    }
    script += 'Let me guide you through this exceptional property. ';

    // Room-specific narration
    for (const room of rooms) {
      script += this.getRoomNarration(room, 'professional') + ' ';
    }

    // Highlight key features
    if (listingData?.bullets && listingData.bullets.length > 0) {
      script += 'Key features include ' + listingData.bullets.slice(0, 3).join(', ') + '. ';
    }

    // Closing
    script += 'This property offers an exceptional combination of comfort, style, and location. ';
    script += 'Contact us today to schedule your private showing. Thank you for your time.';

    return script;
  }

  private generateWarmScript(
    rooms: string[], 
    listingData?: { headline?: string; bullets?: string[]; address?: string }
  ): string {
    
    let script = '';

    // Opening
    script += 'Welcome home! ';
    if (listingData?.headline) {
      script += `I'm excited to show you ${listingData.headline}. `;
    }

    // Room narration with warmer tone
    for (const room of rooms) {
      script += this.getRoomNarration(room, 'warm') + ' ';
    }

    // Features with personal touch
    if (listingData?.bullets) {
      script += 'You\'ll love features like ' + listingData.bullets.slice(0, 3).join(', ') + '. ';
    }

    // Warm closing
    script += 'I hope you can picture yourself calling this place home. ';
    script += 'I\'d love to answer any questions and arrange a personal tour. ';

    return script;
  }

  private generateLuxuryScript(
    rooms: string[], 
    listingData?: { headline?: string; bullets?: string[]; address?: string }
  ): string {
    
    let script = '';

    // Elegant opening
    if (listingData?.headline) {
      script += `Presenting ${listingData.headline}, a residence of distinction. `;
    } else {
      script += 'Experience a residence of unparalleled elegance. ';
    }

    // Sophisticated room descriptions
    for (const room of rooms) {
      script += this.getRoomNarration(room, 'luxury') + ' ';
    }

    // Luxury features emphasis
    if (listingData?.bullets) {
      script += 'Refined appointments include ' + listingData.bullets.slice(0, 3).join(', ') + '. ';
    }

    // Exclusive closing
    script += 'This extraordinary property represents the pinnacle of sophisticated living. ';
    script += 'Schedule your exclusive preview today.';

    return script;
  }

  private getRoomNarration(room: string, style: 'professional' | 'warm' | 'luxury'): string {
    const narrations = {
      professional: {
        exterior: 'The impressive exterior showcases excellent curb appeal and quality construction.',
        entry: 'Step into the welcoming entryway that sets the tone for the entire home.',
        living: 'The spacious living area features abundant natural light and open flow.',
        kitchen: 'The well-appointed kitchen offers modern amenities and efficient layout.',
        bedroom: 'This comfortable bedroom provides peaceful retreat space.',
        bathroom: 'The bathroom features quality fixtures and thoughtful design.',
        backyard: 'The private outdoor space offers excellent potential for relaxation and entertainment.'
      },
      warm: {
        exterior: 'What a beautiful first impression this home makes with its charming exterior.',
        entry: 'Come on in! This lovely entryway feels so welcoming and bright.',
        living: 'This is where you\'ll spend most of your time - such a cozy and bright living space.',
        kitchen: 'The heart of the home! This kitchen is perfect for cooking and gathering.',
        bedroom: 'This peaceful bedroom is your personal sanctuary for rest and relaxation.',
        bathroom: 'A spa-like bathroom where you can unwind after a long day.',
        backyard: 'Step outside to your own private oasis - perfect for morning coffee or evening relaxation.'
      },
      luxury: {
        exterior: 'An impressive facade that commands attention with its architectural sophistication.',
        entry: 'Enter through this grand foyer that epitomizes elegance and refined taste.',
        living: 'This magnificent living space exemplifies luxury with its soaring ceilings and premium finishes.',
        kitchen: 'A culinary masterpiece featuring top-of-the-line appliances and exquisite craftsmanship.',
        bedroom: 'This sumptuous bedroom suite offers the ultimate in comfort and tranquility.',
        bathroom: 'An opulent spa-inspired bathroom with luxury appointments throughout.',
        backyard: 'Your private estate grounds provide an exclusive retreat for sophisticated entertaining.'
      }
    };

    return narrations[style][room as keyof typeof narrations.professional] || 
           `This ${room} showcases exceptional attention to detail.`;
  }

  // List available voices
  async getAvailableVoices(languageCode: string = 'en-US'): Promise<Array<{ name: string; gender: string; type: string }>> {
    try {
      const [response] = await this.client.listVoices({
        languageCode
      });

      return response.voices?.map(voice => ({
        name: voice.name || '',
        gender: String(voice.ssmlGender || ''),
        type: voice.name?.includes('Neural') ? 'Neural' : 'Standard'
      })) || [];
    } catch (error) {
      console.warn('Could not fetch available voices:', error);
      return [
        { name: 'en-US-Neural2-D', gender: 'MALE', type: 'Neural' },
        { name: 'en-US-Neural2-F', gender: 'FEMALE', type: 'Neural' }
      ];
    }
  }
}
