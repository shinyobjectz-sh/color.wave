// adjustmentsRender — turn the adjustment-layers list into:
//   1. an SVG <defs> block carrying every layer's <filter> definition
//      (one per layer, params interpolated into filter primitives)
//   2. a small inline runtime that runs on the iframe's `tick` and
//      composes the active layers' filters as `filter:` on <body>
//
// Called from composition.svelte.js:buildSrcdoc(). Output is a single
// chunk of HTML appended after the composition body and before the
// iframe runtime — sibling to renderEffects().
//
// Why SVG filters (not WebGL post-process for v0):
//   - Browser-native, zero setup, no canvas / GL context to manage
//   - feColorMatrix + feTurbulence + feDisplacementMap + feGaussianBlur
//     cover CRT, scanlines, glitch, VHS, grain, color-grade — the whole
//     v0 catalog
//   - Composes cleanly via `filter: url(#a) url(#b) url(#c)` so multiple
//     active layers stack without us writing blend code
//   - WebGL post-processing is a follow-up for shaders that genuinely
//     need GLSL (light leaks, real lens distortion, neural style)
//
// Trust model. Shader id picks a TEMPLATE from this file's catalog;
// params come from the user via the panel or the agent. We interpolate
// numeric params with explicit clamping/coercion in each builder so
// a malformed value can't escape the SVG context. Selectors + raw
// strings never reach the DOM — only the catalog's pre-baked filter
// shape does.

import { ADJUSTMENT_TRACK_BASE } from "./adjustments.svelte.js";

/** Build the head/body block to append to the iframe srcdoc. Empty list
 *  → empty string so the iframe stays clean. */
export function renderAdjustments(items) {
  if (!items?.length) return "";

  const filters = [];
  const layerData = [];
  for (const a of items) {
    const builder = SHADER_CATALOG[a.shader];
    if (!builder) {
      // Agent-authored shader id we don't know about — skip silently.
      // Console-warn in the iframe runtime so the agent gets a hint
      // when the user reports "my shader didn't apply."
      continue;
    }
    const filterId = `wb-adj-${a.id}`;
    const filterMarkup = builder.svgFilter(filterId, a.params || {});
    filters.push(filterMarkup);
    layerData.push({
      id: a.id,
      filterId,
      start: Number(a.start) || 0,
      end: (Number(a.start) || 0) + (Number(a.duration) || 0),
      opacity: clamp01(a.opacity ?? 1),
      blendMode: a.blendMode || "normal",
    });
  }

  if (!filters.length) return "";

  // Single SVG holds every layer's filter. position:absolute + size 0
  // keeps it from interfering with the body layout — only the filter
  // refs are consumed.
  const defs = `<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none">
<defs>
${filters.join("\n")}
</defs>
</svg>`;

  // Inline runtime — keeps the iframe self-contained. Listens for
  // `tick` events on window (the IFRAME_RUNTIME emits them for its
  // own scene-visibility logic; we hook the same event) and rewrites
  // body.style.filter to the current chain. No-op when no layers
  // are active (filter: none is cleared so other inline filters the
  // composition might use stay intact… we deliberately overwrite
  // only what we previously wrote, tracked via __wbAdj markers).
  const layerJson = JSON.stringify(layerData).replace(/</g, "\\u003c");
  const runtime = `<script>
(function(){
  var layers = ${layerJson};
  if (!layers.length) return;
  // Sort once so the filter chain order is stable across ticks (the
  // composition order matches trackIndex, so layers higher in the
  // timeline render last — same as DOM stacking).
  layers.sort(function(a,b){return a.start - b.start;});

  var lastFilter = "";
  function activeAt(t) {
    var ids = [];
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      if (t >= l.start && t < l.end) ids.push("url(#" + l.filterId + ")");
    }
    return ids.join(" ");
  }
  function applyAt(t) {
    var f = activeAt(t);
    if (f === lastFilter) return;
    lastFilter = f;
    document.body.style.filter = f || "";
    document.body.dataset.wbAdj = f ? "1" : "";
  }
  // Hook the parent's "tick" message so we apply on every frame the
  // GSAP timeline ticks the parent. Cheap — applyAt is a hash check.
  window.addEventListener("message", function(ev){
    var m = ev.data || {};
    if (m.type === "tick") applyAt(m.t || 0);
  });
  // Also apply once at load so a paused workbook at t=start_of_layer
  // shows the filter immediately.
  document.addEventListener("DOMContentLoaded", function(){
    applyAt(0);
  });
})();
</script>`;

  return defs + "\n" + runtime;
}

/** SVG filter catalog. Each entry returns a `<filter id="...">…</filter>`
 *  string given the filter id + a params object. Params are numeric
 *  unless explicitly noted; each builder clamps + coerces.
 *
 *  When adding a shader, also add a card to src/skills/adjustments/
 *  references/catalog.md so the agent knows when to reach for it.
 */
export const SHADER_CATALOG = {
  /** Classic CRT — phosphor scanlines + RGB shift + slight blur. The
   *  workhorse retro-display look. */
  crt: {
    label: "CRT",
    description: "Scanlines + RGB phosphor shift, like an old TV",
    params: {
      scanlineIntensity: { kind: "number", min: 0, max: 1, default: 0.4, label: "Scanline strength" },
      rgbShift: { kind: "number", min: 0, max: 8, default: 1.5, label: "RGB shift (px)" },
      blur: { kind: "number", min: 0, max: 3, default: 0.6, label: "Blur" },
    },
    svgFilter(id, p) {
      const scan = clamp01(num(p.scanlineIntensity, 0.4));
      const shift = clampRange(num(p.rgbShift, 1.5), 0, 8);
      const blur = clampRange(num(p.blur, 0.6), 0, 3);
      return `<filter id="${id}" x="0%" y="0%" width="100%" height="100%">
  <feGaussianBlur stdDeviation="${blur.toFixed(2)}" result="blurred"/>
  <feOffset in="blurred" dx="${shift.toFixed(2)}" dy="0" result="rOff"/>
  <feOffset in="blurred" dx="${(-shift).toFixed(2)}" dy="0" result="bOff"/>
  <feColorMatrix in="rOff" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rOnly"/>
  <feColorMatrix in="bOff" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bOnly"/>
  <feColorMatrix in="blurred" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gOnly"/>
  <feBlend in="rOnly" in2="gOnly" mode="screen" result="rg"/>
  <feBlend in="rg" in2="bOnly" mode="screen" result="rgb"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.001 0.4" numOctaves="1" seed="2" result="scanNoise"/>
  <feColorMatrix in="scanNoise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${scan.toFixed(2)} 0" result="scanlines"/>
  <feComposite in="scanlines" in2="rgb" operator="in" result="scanlinesMasked"/>
  <feBlend in="rgb" in2="scanlinesMasked" mode="multiply"/>
</filter>`;
    },
  },

  /** Subtle scanlines, no RGB shift. For "filmic" or "monitor capture"
   *  vibes without the full retro CRT character. */
  scanlines: {
    label: "Scanlines",
    description: "Horizontal noise lines, subtle by default",
    params: {
      intensity: { kind: "number", min: 0, max: 1, default: 0.25, label: "Strength" },
      density: { kind: "number", min: 0.1, max: 1, default: 0.5, label: "Density" },
    },
    svgFilter(id, p) {
      const i = clamp01(num(p.intensity, 0.25));
      const d = clampRange(num(p.density, 0.5), 0.1, 1);
      return `<filter id="${id}" x="0%" y="0%" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.001 ${d.toFixed(2)}" numOctaves="1" seed="3" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${i.toFixed(2)} 0" result="lines"/>
  <feComposite in="lines" in2="SourceGraphic" operator="in" result="masked"/>
  <feBlend in="SourceGraphic" in2="masked" mode="multiply"/>
</filter>`;
    },
  },

  /** Chromatic aberration + jitter. Use sparingly — looks great on
   *  beat drops, glitchy intros. */
  glitch: {
    label: "Glitch",
    description: "Chromatic aberration + horizontal jitter",
    params: {
      shift: { kind: "number", min: 0, max: 12, default: 4, label: "Channel shift (px)" },
      jitter: { kind: "number", min: 0, max: 10, default: 2, label: "Displacement" },
    },
    svgFilter(id, p) {
      const s = clampRange(num(p.shift, 4), 0, 12);
      const j = clampRange(num(p.jitter, 2), 0, 10);
      return `<filter id="${id}" x="0%" y="0%" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.02 0.3" numOctaves="2" seed="5" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="${j.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="disp"/>
  <feOffset in="disp" dx="${s.toFixed(2)}" dy="0" result="rOff"/>
  <feOffset in="disp" dx="${(-s).toFixed(2)}" dy="0" result="bOff"/>
  <feColorMatrix in="rOff" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rOnly"/>
  <feColorMatrix in="bOff" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bOnly"/>
  <feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gOnly"/>
  <feBlend in="rOnly" in2="gOnly" mode="screen" result="rg"/>
  <feBlend in="rg" in2="bOnly" mode="screen"/>
</filter>`;
    },
  },

  /** Film grain — fractal-noise overlay. Great over color-graded clips. */
  grain: {
    label: "Film grain",
    description: "Fractal-noise grain overlay",
    params: {
      intensity: { kind: "number", min: 0, max: 1, default: 0.18, label: "Strength" },
      size: { kind: "number", min: 0.1, max: 3, default: 0.9, label: "Grain size" },
    },
    svgFilter(id, p) {
      const i = clamp01(num(p.intensity, 0.18));
      const s = clampRange(num(p.size, 0.9), 0.1, 3);
      const freq = (1 / s).toFixed(3);
      return `<filter id="${id}" x="0%" y="0%" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="7" result="grain"/>
  <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${i.toFixed(2)} 0" result="grainAlpha"/>
  <feComposite in="grainAlpha" in2="SourceGraphic" operator="in" result="masked"/>
  <feBlend in="SourceGraphic" in2="masked" mode="overlay"/>
</filter>`;
    },
  },

  /** Color grade — saturation, hue rotation, contrast. The "make it
   *  look filmic / cinematic / nostalgic" knob set. */
  colorgrade: {
    label: "Color grade",
    description: "Saturation, hue rotation, contrast adjustment",
    params: {
      saturation: { kind: "number", min: 0, max: 2, default: 1, label: "Saturation" },
      hue: { kind: "number", min: -180, max: 180, default: 0, label: "Hue (°)" },
      contrast: { kind: "number", min: 0.5, max: 2, default: 1, label: "Contrast" },
    },
    svgFilter(id, p) {
      const sat = clampRange(num(p.saturation, 1), 0, 2);
      const hue = clampRange(num(p.hue, 0), -180, 180);
      const contrast = clampRange(num(p.contrast, 1), 0.5, 2);
      // Contrast via component transfer slope/intercept. slope=c, intercept=(1-c)/2 keeps midpoint at 0.5.
      const intercept = ((1 - contrast) / 2).toFixed(3);
      return `<filter id="${id}" x="0%" y="0%" width="100%" height="100%">
  <feColorMatrix type="saturate" values="${sat.toFixed(2)}" result="sat"/>
  <feColorMatrix in="sat" type="hueRotate" values="${hue.toFixed(1)}" result="hueShift"/>
  <feComponentTransfer in="hueShift">
    <feFuncR type="linear" slope="${contrast.toFixed(2)}" intercept="${intercept}"/>
    <feFuncG type="linear" slope="${contrast.toFixed(2)}" intercept="${intercept}"/>
    <feFuncB type="linear" slope="${contrast.toFixed(2)}" intercept="${intercept}"/>
  </feComponentTransfer>
</filter>`;
    },
  },

  /** VHS — combines warm tint, slight scanlines, and edge softness for
   *  the home-tape recording look. */
  vhs: {
    label: "VHS",
    description: "Warm tint + scanlines + soft edges, like a VHS dub",
    params: {
      warmth: { kind: "number", min: 0, max: 1, default: 0.6, label: "Warmth" },
      scanlines: { kind: "number", min: 0, max: 1, default: 0.3, label: "Scanline strength" },
      softness: { kind: "number", min: 0, max: 2, default: 0.8, label: "Edge softness" },
    },
    svgFilter(id, p) {
      const warm = clamp01(num(p.warmth, 0.6));
      const scan = clamp01(num(p.scanlines, 0.3));
      const soft = clampRange(num(p.softness, 0.8), 0, 2);
      const rBoost = (1 + warm * 0.15).toFixed(3);
      const bCut = (1 - warm * 0.2).toFixed(3);
      return `<filter id="${id}" x="0%" y="0%" width="100%" height="100%">
  <feGaussianBlur stdDeviation="${soft.toFixed(2)}" result="soft"/>
  <feColorMatrix in="soft" type="matrix" values="${rBoost} 0 0 0 0  0 1 0 0 0  0 0 ${bCut} 0 0  0 0 0 1 0" result="warm"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.001 0.45" numOctaves="1" seed="11" result="scanNoise"/>
  <feColorMatrix in="scanNoise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${scan.toFixed(2)} 0" result="lines"/>
  <feComposite in="lines" in2="warm" operator="in" result="linesMasked"/>
  <feBlend in="warm" in2="linesMasked" mode="multiply"/>
</filter>`;
    },
  },
};

// ── coercion helpers ─────────────────────────────────────────────

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function clampRange(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export { ADJUSTMENT_TRACK_BASE };
