export const STYLE_TOKENS = {
  base: "Cinematic real-estate walkthrough shot on a stabilized gimbal at 24fps with natural lighting, accurate white balance, neutral color grade, no people, no lens distortion, no text overlays.",
  
  motion: {
    gentle: "slow, realistic camera movement with subtle push-in and gentle arc",
    arc: "smooth rightward arc movement maintaining steady height",
    reveal: "slow push-in then gentle pan to reveal key features",
    dolly: "steady dolly movement with slight height variation",
    orbit: "gentle orbital movement around the focal point"
  },

  quality: {
    technical: "Professional realty b-roll quality, realistic texture detail, physically plausible motion, no warping or rubbery artifacts",
    lighting: "Natural daylight, soft shadows, even exposure, true-to-life color temperature",
    composition: "Clean composition with clear focal hierarchy, ending with stable frame for crossfade"
  },

  negative: "No people, no fisheye distortion, no oversaturated colors, no quick movements, no camera shake, no text or graphics, no unrealistic effects"
};

export const ROOM_DESCRIPTIONS = {
  exterior: {
    focus: ["architectural details", "landscaping", "curb appeal"],
    motion: "gentle approach revealing the facade and entrance",
    beats: ["establish the home", "showcase exterior features", "guide eye to entrance"]
  },
  
  entry: {
    focus: ["foyer", "entryway details", "sight lines"],
    motion: "welcoming entrance movement with gentle height reveal",
    beats: ["welcome feeling", "show entry details", "hint at interior spaces"]
  },

  living: {
    focus: ["seating area", "windows", "natural light", "flow"],
    motion: "arc around seating revealing windows and flow",
    beats: ["establish the space", "show natural light", "reveal room connections"]
  },

  kitchen: {
    focus: ["island", "appliances", "countertops", "backsplash"],
    motion: "island approach then arc to reveal appliances and details",
    beats: ["island as focal point", "reveal cooking area", "show storage and details"]
  },

  bedroom: {
    focus: ["bed placement", "windows", "closet space", "ambiance"],
    motion: "gentle reveal from doorway with arc toward windows",
    beats: ["establish bed placement", "show natural light", "reveal space and storage"]
  },

  bathroom: {
    focus: ["vanity", "shower/tub", "fixtures", "lighting"],
    motion: "careful reveal of fixtures with emphasis on finishes",
    beats: ["vanity area", "shower/bath reveal", "lighting and finish details"]
  },

  backyard: {
    focus: ["outdoor space", "landscaping", "entertaining areas", "privacy"],
    motion: "establishing wide view then closer reveals of features",
    beats: ["overall yard space", "entertaining areas", "landscaping features"]
  }
};

export function buildRoomPrompt(room: string, customBeats?: string[]): string {
  return "Create video movement through this space. Maintain the exact room layout, wall positions, dimensions, and architectural elements. The furniture may be changed or rearranged as long as it fits properly within the existing space dimensions and maintains realistic proportions for the room.";
}
