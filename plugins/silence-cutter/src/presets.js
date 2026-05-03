// Bezier presets — cubic curve P0=(0,0), P3=(1,1), user shapes P1/P2.
//
// The single curve drives THREE numbers per silence:
//   attack_norm = P1.x         (how soon after voice ends do we start fading)
//   decay_norm  = 1 - P2.x     (how late before voice resumes do we fade in)
//   depth       = max(P1.y, 1 - P2.y)   (crossfade aggressiveness)
//
// One control gesture, three coordinated knobs. Coordinates live in [0,1].

export const PRESETS = [
  {
    id: "punchy",
    label: "Punchy",
    description: "Tight cuts, hard transitions. For high-energy promo / shorts.",
    p1: { x: 0.05, y: 0.05 },
    p2: { x: 0.95, y: 0.95 },
    attackMaxMs: 80,
    decayMaxMs: 80,
    crossfadeMaxMs: 30,
  },
  {
    id: "natural",
    label: "Natural",
    description: "Hold a beat of breath at each cut. The default.",
    p1: { x: 0.25, y: 0.20 },
    p2: { x: 0.75, y: 0.80 },
    attackMaxMs: 180,
    decayMaxMs: 180,
    crossfadeMaxMs: 80,
  },
  {
    id: "podcast",
    label: "Podcast",
    description: "Generous pads + soft crossfades. Conversational tone.",
    p1: { x: 0.40, y: 0.35 },
    p2: { x: 0.60, y: 0.65 },
    attackMaxMs: 280,
    decayMaxMs: 280,
    crossfadeMaxMs: 140,
  },
  {
    id: "asmr",
    label: "ASMR",
    description: "Maximum room tone preserved. Long crossfades, no pops.",
    p1: { x: 0.55, y: 0.60 },
    p2: { x: 0.45, y: 0.40 },
    attackMaxMs: 400,
    decayMaxMs: 400,
    crossfadeMaxMs: 220,
  },
];

export function findPreset(id) {
  return PRESETS.find((p) => p.id === id) ?? null;
}

export const DEFAULT_PRESET_ID = "natural";
