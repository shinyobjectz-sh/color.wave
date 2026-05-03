// themes — curated Shiki theme presets, each with a small UI label
// and a default cursor color. Cursor color falls back to the theme's
// foreground if not specified.

export const THEMES = [
  { id: "github-dark", label: "GitHub Dark", bg: "#0d1117", fg: "#c9d1d9", cursor: "#58a6ff" },
  { id: "github-light", label: "GitHub Light", bg: "#ffffff", fg: "#24292f", cursor: "#0969da" },
  { id: "vitesse-dark", label: "Vitesse Dark", bg: "#121212", fg: "#dbd7caee", cursor: "#dbd7ca" },
];

export function findTheme(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export const DEFAULT_THEME_ID = "github-dark";
