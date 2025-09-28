import { Scene, ListingData } from '../types.js';
import { buildRoomPrompt, ROOM_DESCRIPTIONS } from './styleTokens.js';

export interface PromptContext {
  scene: Scene;
  listing?: ListingData;
  previousRoom?: string;
  nextRoom?: string;
  segmentIndex: number;
  totalSegments: number;
}

export function generateSegmentPrompt(context: PromptContext): string {
  return "Create video movement through this space. Maintain the exact room layout, wall positions, dimensions, and architectural elements. The furniture may be changed or rearranged as long as it fits properly within the existing space dimensions and maintains realistic proportions for the room.";
}

function getTransitionGuidance(fromRoom: string, toRoom: string): string {
  const transitions: Record<string, Record<string, string>> = {
    exterior: {
      entry: "Camera should suggest movement toward and through the entrance",
      living: "End with view that implies interior spaces beyond"
    },
    entry: {
      living: "Camera movement should flow naturally into main living areas",
      kitchen: "Suggest connection to cooking/gathering spaces"
    },
    living: {
      kitchen: "Pan toward kitchen area or cooking space connection",
      bedroom: "Gentle movement suggesting private areas beyond",
      backyard: "Orient toward outdoor connections or views"
    },
    kitchen: {
      living: "Show connection back to main entertaining space",
      bedroom: "Transition toward more private areas of the home",
      backyard: "Emphasize any outdoor dining or entertaining connections"
    },
    bedroom: {
      bathroom: "Show ensuite connection or private bathroom access",
      backyard: "If master, show outdoor views or private yard access"
    }
  };

  return transitions[fromRoom]?.[toRoom] || "Smooth camera movement for natural scene flow";
}

function getRelevantFeatures(room: string, features: string[]): string[] {
  const roomKeywords: Record<string, string[]> = {
    kitchen: ['kitchen', 'cook', 'chef', 'appliance', 'island', 'granite', 'marble', 'cabinet', 'pantry'],
    living: ['living', 'fireplace', 'window', 'light', 'open', 'spacious', 'hardwood', 'view'],
    bedroom: ['bedroom', 'master', 'suite', 'closet', 'walk-in', 'private', 'quiet'],
    bathroom: ['bathroom', 'bath', 'shower', 'tub', 'vanity', 'marble', 'tile', 'spa'],
    backyard: ['yard', 'garden', 'outdoor', 'patio', 'deck', 'pool', 'entertaining', 'private'],
    exterior: ['exterior', 'curb', 'facade', 'landscape', 'garage', 'parking', 'entrance']
  };

  const keywords = roomKeywords[room] || [];
  
  return features.filter(feature => 
    keywords.some(keyword => 
      feature.toLowerCase().includes(keyword)
    )
  );
}

export function generateVoiceoverScript(
  scenes: Scene[], 
  listing?: ListingData,
  targetDuration = 90
): string {
  const intro = generateIntro(listing);
  const roomNarration = generateRoomNarration(scenes, listing);
  const outro = generateOutro(listing);
  
  return `${intro}\n\n${roomNarration}\n\n${outro}`;
}

function generateIntro(listing?: ListingData): string {
  if (listing?.headline) {
    return `Welcome to ${listing.headline}. Let's take a tour of this exceptional property.`;
  }
  return "Welcome home. Let's explore this beautiful property together.";
}

function generateRoomNarration(scenes: Scene[], listing?: ListingData): string {
  return scenes.map(scene => {
    const roomName = scene.room === 'living' ? 'living room' : scene.room;
    const baseNarration = getRoomNarration(scene.room);
    
    // Add specific features if available
    if (listing?.bullets) {
      const relevantFeatures = getRelevantFeatures(scene.room, listing.bullets);
      if (relevantFeatures.length > 0) {
        return `${baseNarration} Notice the ${relevantFeatures.join(' and ')}.`;
      }
    }
    
    return baseNarration;
  }).join(' ');
}

function getRoomNarration(room: string): string {
  const narrations: Record<string, string> = {
    exterior: "Here's your first look at this stunning home with its impressive curb appeal.",
    entry: "Step inside to this welcoming entryway that sets the tone for the entire home.",
    living: "The heart of the home features this spacious living area with abundant natural light.",
    kitchen: "The kitchen is a chef's dream with premium finishes and thoughtful design.",
    bedroom: "This peaceful bedroom offers comfort and tranquility with plenty of space.",
    bathroom: "The bathroom showcases beautiful finishes and spa-like amenities.",
    backyard: "Finally, step outside to enjoy this private outdoor oasis."
  };

  return narrations[room] || `This ${room} offers wonderful features and attention to detail.`;
}

function generateOutro(listing?: ListingData): string {
  let outro = "Thank you for touring this exceptional property.";
  
  if (listing?.address) {
    outro += ` Located at ${listing.address},`;
  }
  
  outro += " this home offers the perfect blend of comfort, style, and convenience.";
  outro += " Contact us today to schedule your private showing.";
  
  return outro;
}
