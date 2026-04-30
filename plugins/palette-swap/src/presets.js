// Built-in palettes — each one is a map of CSS custom-property names
// to color values. The composition decorator rewrites these vars in
// the rendered HTML by inserting a small <style> block scoped to :root.
//
// Naming: keep keys generic (--cw-bg, --cw-fg, --cw-accent, --cw-mute)
// so any composition author who wires their HTML to those vars gets
// recoloring for free. Compositions that don't use the vars are
// unaffected — palette-swap is opt-in at the composition level.

export const PRESETS = [
  {
    id: "neutral-dark",
    label: "Neutral Dark",
    swatches: ["#0f172a", "#f1f5f9", "#94a3b8", "#cbd5e1"],
    vars: {
      "--cw-bg":     "#0f172a",
      "--cw-fg":     "#f1f5f9",
      "--cw-mute":   "#94a3b8",
      "--cw-accent": "#cbd5e1",
    },
  },
  {
    id: "neutral-light",
    label: "Neutral Light",
    swatches: ["#f8fafc", "#0f172a", "#475569", "#1e293b"],
    vars: {
      "--cw-bg":     "#f8fafc",
      "--cw-fg":     "#0f172a",
      "--cw-mute":   "#475569",
      "--cw-accent": "#1e293b",
    },
  },
  {
    id: "rose-noir",
    label: "Rose Noir",
    swatches: ["#1c1917", "#fafaf9", "#a8a29e", "#f43f5e"],
    vars: {
      "--cw-bg":     "#1c1917",
      "--cw-fg":     "#fafaf9",
      "--cw-mute":   "#a8a29e",
      "--cw-accent": "#f43f5e",
    },
  },
  {
    id: "amber-graphite",
    label: "Amber Graphite",
    swatches: ["#18181b", "#fafaf9", "#71717a", "#fbbf24"],
    vars: {
      "--cw-bg":     "#18181b",
      "--cw-fg":     "#fafaf9",
      "--cw-mute":   "#71717a",
      "--cw-accent": "#fbbf24",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatches: ["#082f49", "#e0f2fe", "#7dd3fc", "#38bdf8"],
    vars: {
      "--cw-bg":     "#082f49",
      "--cw-fg":     "#e0f2fe",
      "--cw-mute":   "#7dd3fc",
      "--cw-accent": "#38bdf8",
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatches: ["#14532d", "#ecfccb", "#86efac", "#bef264"],
    vars: {
      "--cw-bg":     "#14532d",
      "--cw-fg":     "#ecfccb",
      "--cw-mute":   "#86efac",
      "--cw-accent": "#bef264",
    },
  },
];

export function findPreset(id) {
  return PRESETS.find((p) => p.id === id);
}
