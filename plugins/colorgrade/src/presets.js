// presets — film/look CSS filter recipes for the v0.1 fast path.
//
// Each preset is a {name, filter, curves?} triple. `filter` is a
// CSS filter string that the decorator drops onto :root --cg-filter.
// `curves` is an optional tweak suggestion the user can layer (for v0.2
// when curves bake into a real 3D LUT).
//
// These were hand-tuned to look distinctive at 100% strength; the
// strength slider blends them with the original.

export const PRESETS = [
  {
    id: "neutral",
    label: "Neutral",
    description: "No grade. Bypass the filter, restore the truth.",
    filter: "none",
    swatches: ["#1a1a1a", "#888", "#eee"],
  },
  {
    id: "kodak-2383",
    label: "Kodak 2383",
    description: "Warm shadows, peach highlights — classic film print.",
    filter: "brightness(1.04) contrast(1.12) saturate(0.95) sepia(0.10) hue-rotate(-8deg)",
    swatches: ["#3b2a1a", "#c89868", "#f6e4c2"],
  },
  {
    id: "fuji-3510",
    label: "Fuji 3510",
    description: "Cool greens, restrained reds — Wong Kar-wai-ish.",
    filter: "brightness(1.02) contrast(1.08) saturate(0.92) hue-rotate(6deg)",
    swatches: ["#1c2a26", "#7a9a8d", "#e7eee8"],
  },
  {
    id: "polaroid-600",
    label: "Polaroid 600",
    description: "Warm casts, soft contrast, slight green shadows.",
    filter: "brightness(1.06) contrast(0.96) saturate(0.85) sepia(0.18) hue-rotate(-15deg)",
    swatches: ["#2a261c", "#d2b08e", "#f8eed5"],
  },
  {
    id: "teal-orange",
    label: "Teal & Orange",
    description: "The Hollywood blockbuster grade. Pushes complementaries.",
    filter: "brightness(1.0) contrast(1.18) saturate(1.25) hue-rotate(-4deg)",
    swatches: ["#0e2535", "#d28560", "#fff7ed"],
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description: "Magenta highlights, cyan shadows, crushed contrast.",
    filter: "brightness(0.92) contrast(1.30) saturate(1.40) hue-rotate(-22deg)",
    swatches: ["#0a1226", "#a64bff", "#13e6ef"],
  },
  {
    id: "bleach-bypass",
    label: "Bleach Bypass",
    description: "Skipped silver retain — desaturated with crushed blacks.",
    filter: "brightness(1.0) contrast(1.40) saturate(0.30)",
    swatches: ["#0a0a0a", "#7e7e7e", "#f0f0f0"],
  },
  {
    id: "cross-process",
    label: "Cross-process",
    description: "C-41 in E-6 chemistry. Yellows pop, blues crush.",
    filter: "brightness(1.05) contrast(1.20) saturate(1.40) hue-rotate(20deg) sepia(0.05)",
    swatches: ["#15280f", "#d4be4a", "#f1f8c0"],
  },
];

export function findPreset(id) {
  return PRESETS.find((p) => p.id === id) ?? null;
}

export const DEFAULT_PRESET_ID = "neutral";
