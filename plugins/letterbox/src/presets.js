// presets — letterbox aspect ratios.
//
// barFrac = (1 - target/source) / 2 — fraction of viewport each bar
// occupies, assuming a 16:9 source. For 4:3 we flip orientation
// (vertical pillarboxes on a 16:9 source).

export const RATIOS = [
  { id: "off",     label: "Off",                  ratio: 0,    orientation: "h" },
  { id: "239",     label: "Cinema (2.39:1)",      ratio: 2.39, orientation: "h" },
  { id: "220",     label: "70mm (2.20:1)",        ratio: 2.20, orientation: "h" },
  { id: "185",     label: "Widescreen (1.85:1)",  ratio: 1.85, orientation: "h" },
  { id: "43",      label: "Vintage (4:3 pillar)", ratio: 4 / 3, orientation: "v" },
];

export function findRatio(id) {
  return RATIOS.find((r) => r.id === id) ?? RATIOS[0];
}

export const DEFAULT_RATIO_ID = "239";

/**
 * Bar fraction (0..0.5) of a 16:9 viewport. For horizontal letterbox
 * the bar is on top and bottom; for vertical (pillarbox) it's on the
 * left and right.
 */
export function barFraction(ratio, orientation, source = 16 / 9) {
  if (!ratio || ratio === 0) return 0;
  if (orientation === "h") {
    if (ratio <= source) return 0;
    const targetH = source / ratio;
    return (1 - targetH) / 2;
  } else {
    // vertical (pillarbox): source-aspect wider than target
    if (ratio >= source) return 0;
    const targetW = ratio / source;
    return (1 - targetW) / 2;
  }
}
