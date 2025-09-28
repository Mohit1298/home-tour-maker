import { ImageInput, Scene, ScenePlan, OutputConfig, PipelineContext } from '../types.js';

export interface ScenePlannerOptions {
  preferVeoOverKenBurns?: boolean;
  maxVeoSegments?: number;
  minSegmentDuration?: number;
  maxSegmentDuration?: number;
  crossfadeDuration?: number;
}

export class ScenePlanner {
  private context: PipelineContext;
  private options: Required<ScenePlannerOptions>;

  constructor(context: PipelineContext, options: ScenePlannerOptions = {}) {
    this.context = context;
    this.options = {
      preferVeoOverKenBurns: options.preferVeoOverKenBurns ?? true,
      maxVeoSegments: options.maxVeoSegments ?? 15, // Rate limit consideration
      minSegmentDuration: options.minSegmentDuration ?? 4,
      maxSegmentDuration: options.maxSegmentDuration ?? 8,
      crossfadeDuration: options.crossfadeDuration ?? 0.75
    };
  }

  async planScenes(images: ImageInput[], outputConfig: OutputConfig): Promise<ScenePlan> {
    this.context.onProgress?.('planning', 0, 'Analyzing images and grouping by room');

    // Group images by room in logical flow order
    const roomGroups = this.groupImagesByRoom(images);
    
    this.context.onProgress?.('planning', 25, 'Calculating segment timing');

    // Calculate timing constraints
    const timing = this.calculateTiming(outputConfig, roomGroups.size);
    
    this.context.onProgress?.('planning', 50, 'Creating scene segments');

    // Create scenes based on room groups and timing
    const scenes = this.createScenes(roomGroups, timing);

    this.context.onProgress?.('planning', 75, 'Optimizing scene distribution');

    // Optimize scene distribution (Veo vs Ken Burns)
    const optimizedScenes = this.optimizeScenes(scenes, timing);

    this.context.onProgress?.('planning', 100, 'Scene planning complete');

    return this.buildScenePlan(optimizedScenes);
  }

  private groupImagesByRoom(images: ImageInput[]): Map<string, ImageInput[]> {
    // Define logical room flow order for home tours
    const roomOrder = [
      'exterior',
      'entry', 
      'living',
      'kitchen',
      'bedroom',
      'bathroom',
      'backyard'
    ];

    const roomGroups = new Map<string, ImageInput[]>();

    // Initialize groups
    roomOrder.forEach(room => roomGroups.set(room, []));
    
    // Add 'other' category for unrecognized rooms
    roomGroups.set('other', []);

    // Group images by room
    for (const image of images) {
      const room = image.room || 'other';
      const group = roomGroups.get(room) || roomGroups.get('other')!;
      group.push(image);
    }

    // Remove empty groups except 'other'
    for (const [room, group] of roomGroups.entries()) {
      if (group.length === 0 && room !== 'other') {
        roomGroups.delete(room);
      }
    }

    // If 'other' has images, determine better room assignments
    const otherImages = roomGroups.get('other') || [];
    if (otherImages.length > 0) {
      this.redistributeOtherImages(otherImages, roomGroups);
      roomGroups.delete('other');
    }

    return roomGroups;
  }

  private redistributeOtherImages(otherImages: ImageInput[], roomGroups: Map<string, ImageInput[]>) {
    // Distribute 'other' images based on sequence position and existing room sizes
    const sortedRooms = Array.from(roomGroups.entries())
      .filter(([room, images]) => room !== 'other' && images.length > 0)
      .sort(([, a], [, b]) => a.length - b.length); // Smallest groups first

    for (const image of otherImages) {
      if (sortedRooms.length > 0) {
        // Add to smallest existing room group
        const [targetRoom] = sortedRooms[0];
        roomGroups.get(targetRoom)!.push(image);
        // Re-sort after adding
        sortedRooms.sort(([, a], [, b]) => a.length - b.length);
      } else {
        // Fallback: create a 'living' group
        if (!roomGroups.has('living')) {
          roomGroups.set('living', []);
        }
        roomGroups.get('living')!.push(image);
      }
    }
  }

  private calculateTiming(outputConfig: OutputConfig, roomCount: number): TimingConstraints {
    const { targetSeconds } = outputConfig;
    const { crossfadeDuration, maxVeoSegments, minSegmentDuration, maxSegmentDuration } = this.options;

    // Account for crossfades between segments
    const estimatedSegments = Math.min(roomCount + 2, maxVeoSegments * 1.5); // Some buffer for Ken Burns
    const crossfadeTime = Math.max(0, estimatedSegments - 1) * crossfadeDuration;
    const availableContentTime = targetSeconds - crossfadeTime;

    // Determine optimal segment duration
    const idealSegmentDuration = Math.max(
      minSegmentDuration,
      Math.min(maxSegmentDuration, availableContentTime / roomCount)
    );

    return {
      targetDuration: targetSeconds,
      availableContentTime,
      idealSegmentDuration,
      maxVeoSegments,
      crossfadeTime,
      roomCount
    };
  }

  private createScenes(roomGroups: Map<string, ImageInput[]>, timing: TimingConstraints): Scene[] {
    const scenes: Scene[] = [];
    let sceneIndex = 0;

    for (const [room, images] of roomGroups.entries()) {
      if (images.length === 0) continue;

      // Determine if this room needs multiple scenes
      const roomScenes = this.createRoomScenes(room, images, timing, sceneIndex);
      scenes.push(...roomScenes);
      sceneIndex += roomScenes.length;
    }

    return scenes;
  }

  private createRoomScenes(room: string, images: ImageInput[], timing: TimingConstraints, startIndex: number): Scene[] {
    const scenes: Scene[] = [];
    const { idealSegmentDuration } = timing;

    // For rooms with many images, consider splitting into multiple scenes
    if (images.length > 4 && room !== 'exterior') {
      // Split into multiple scenes for large rooms
      const scenesNeeded = Math.ceil(images.length / 3);
      const imagesPerScene = Math.ceil(images.length / scenesNeeded);

      for (let i = 0; i < scenesNeeded; i++) {
        const sceneImages = images.slice(i * imagesPerScene, (i + 1) * imagesPerScene);
        const sceneId = `${room}_${i + 1}`;
        const description = this.generateSceneDescription(room, i, scenesNeeded);

        scenes.push({
          id: sceneId,
          room,
          images: sceneImages,
          duration: idealSegmentDuration,
          type: 'veo', // Will be optimized later
          description,
          focusPoints: this.generateFocusPoints(room, sceneImages, i)
        });
      }
    } else {
      // Single scene for this room
      const sceneId = room;
      const description = this.generateSceneDescription(room, 0, 1);

      scenes.push({
        id: sceneId,
        room,
        images,
        duration: idealSegmentDuration,
        type: 'veo',
        description,
        focusPoints: this.generateFocusPoints(room, images, 0)
      });
    }

    return scenes;
  }

  private optimizeScenes(scenes: Scene[], timing: TimingConstraints): Scene[] {
    const { maxVeoSegments, availableContentTime } = timing;
    
    // Priority order for Veo segments (most important rooms first)
    const veoPriority = ['exterior', 'living', 'kitchen', 'bedroom', 'entry', 'bathroom', 'backyard'];
    
    // Sort scenes by Veo priority
    const sortedScenes = [...scenes].sort((a, b) => {
      const aPriority = veoPriority.indexOf(a.room);
      const bPriority = veoPriority.indexOf(b.room);
      return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
    });

    let veoSegmentsUsed = 0;
    let totalDuration = 0;

    // First pass: assign Veo to highest priority scenes
    for (const scene of sortedScenes) {
      if (veoSegmentsUsed < maxVeoSegments && this.options.preferVeoOverKenBurns) {
        scene.type = 'veo';
        veoSegmentsUsed++;
      } else {
        scene.type = 'kenburns';
        // Ken Burns segments can be shorter if needed
        scene.duration = Math.min(scene.duration, 6);
      }
      totalDuration += scene.duration;
    }

    // Second pass: adjust durations to fit target
    if (totalDuration !== availableContentTime) {
      this.adjustSceneDurations(sortedScenes, availableContentTime);
    }

    // Third pass: add filler scenes if we're under target
    if (totalDuration < availableContentTime * 0.95) {
      this.addFillerScenes(sortedScenes, availableContentTime - totalDuration);
    }

    return sortedScenes;
  }

  private adjustSceneDurations(scenes: Scene[], targetDuration: number): void {
    const currentDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
    const adjustmentFactor = targetDuration / currentDuration;

    for (const scene of scenes) {
      const newDuration = scene.duration * adjustmentFactor;
      
      // Respect min/max bounds
      if (scene.type === 'veo') {
        scene.duration = Math.max(4, Math.min(8, newDuration));
      } else {
        scene.duration = Math.max(3, Math.min(10, newDuration));
      }
    }
  }

  private addFillerScenes(scenes: Scene[], additionalTime: number): void {
    // Add Ken Burns scenes from existing images to fill time
    const scenesWithMultipleImages = scenes.filter(s => s.images.length > 1);
    
    if (scenesWithMultipleImages.length > 0 && additionalTime > 3) {
      const sourceScene = scenesWithMultipleImages[0];
      const fillerImage = sourceScene.images[sourceScene.images.length - 1];
      
      const fillerScene: Scene = {
        id: `${sourceScene.id}_filler`,
        room: sourceScene.room,
        images: [fillerImage],
        duration: Math.min(additionalTime, 6),
        type: 'kenburns',
        description: `Additional view of ${sourceScene.room}`,
        focusPoints: ['architectural details', 'ambiance']
      };
      
      scenes.push(fillerScene);
    }
  }

  private generateSceneDescription(room: string, sceneIndex: number, totalScenes: number): string {
    const descriptions: Record<string, string[]> = {
      exterior: ['Stunning curb appeal and architectural details'],
      entry: ['Welcoming entrance with elegant details'],
      living: ['Spacious living area with natural light', 'Comfortable living space with great flow'],
      kitchen: ['Chef\'s kitchen with premium finishes', 'Kitchen island and cooking area'],
      bedroom: ['Peaceful bedroom retreat', 'Master suite with ample space'],
      bathroom: ['Spa-like bathroom with luxury finishes'],
      backyard: ['Private outdoor entertainment space']
    };

    const roomDescriptions = descriptions[room] || ['Beautiful space with attention to detail'];
    
    if (totalScenes === 1) {
      return roomDescriptions[0];
    } else {
      return roomDescriptions[sceneIndex % roomDescriptions.length];
    }
  }

  private generateFocusPoints(room: string, images: ImageInput[], sceneIndex: number): string[] {
    const focusPointsByRoom: Record<string, string[][]> = {
      exterior: [
        ['architectural facade', 'landscaping', 'entrance appeal']
      ],
      entry: [
        ['entryway details', 'lighting fixtures', 'flooring transition']
      ],
      living: [
        ['seating arrangement', 'natural light', 'room flow'],
        ['fireplace area', 'built-ins', 'ceiling details']
      ],
      kitchen: [
        ['island centerpiece', 'appliance suite', 'countertop materials'],
        ['cabinet details', 'backsplash design', 'lighting features']
      ],
      bedroom: [
        ['bed placement', 'window views', 'closet access'],
        ['sitting area', 'built-in features', 'natural light']
      ],
      bathroom: [
        ['vanity details', 'shower/tub area', 'fixture quality']
      ],
      backyard: [
        ['outdoor living space', 'landscaping features', 'privacy elements']
      ]
    };

    const roomFocus = focusPointsByRoom[room] || [['key features', 'design details', 'spatial flow']];
    return roomFocus[sceneIndex % roomFocus.length];
  }

  private buildScenePlan(scenes: Scene[]): ScenePlan {
    const veoSegments = scenes.filter(s => s.type === 'veo').length;
    const kenBurnsSegments = scenes.filter(s => s.type === 'kenburns').length;
    const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);

    return {
      scenes,
      totalDuration,
      veoSegments,
      kenBurnsSegments
    };
  }

  // Utility method to preview the plan
  generatePlanSummary(plan: ScenePlan): string {
    const lines: string[] = [
      `Scene Plan Summary:`,
      `- Total Duration: ${plan.totalDuration.toFixed(1)}s`,
      `- Veo Segments: ${plan.veoSegments}`,
      `- Ken Burns Segments: ${plan.kenBurnsSegments}`,
      `- Total Scenes: ${plan.scenes.length}`,
      ``,
      `Scene Breakdown:`
    ];

    for (const scene of plan.scenes) {
      lines.push(`  ${scene.id}: ${scene.duration.toFixed(1)}s (${scene.type}) - ${scene.images.length} images`);
      if (scene.description) {
        lines.push(`    ${scene.description}`);
      }
    }

    return lines.join('\n');
  }
}

interface TimingConstraints {
  targetDuration: number;
  availableContentTime: number;
  idealSegmentDuration: number;
  maxVeoSegments: number;
  crossfadeTime: number;
  roomCount: number;
}
