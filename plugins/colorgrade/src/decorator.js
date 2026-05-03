// decorator — emit :root --cg-filter and apply it to body so the entire
// composition surface (text, images, video, CSS backgrounds) grades together.
//
// This is the v0.1 "CSS path." The filter chain is the active grade; if
// curves are non-identity, we fold their (brightness, contrast) approximation
// into the chain. Strength scales the whole chain by interpolating
// against `none` via opacity-style blending — actually we just multiply
// each adjustment toward identity (1.0 / 0deg / 0.0).

import { curveToAdj } from "./curves.js";

export function buildFilterChain({ baseFilter, curve, strengthPct }) {
  if (!baseFilter || baseFilter === "none") {
    if (!curve) return "none";
  }
  const s = Math.max(0, Math.min(1, strengthPct / 100));
  if (s === 0) return "none";
  let parts = parseFilter(baseFilter || "");
  if (curve) {
    const { brightness, contrast } = curveToAdj(curve);
    parts.push({ fn: "brightness", v: brightness });
    parts.push({ fn: "contrast",   v: contrast });
  }
  // Blend each part toward identity by `1-s`.
  parts = parts.map((p) => ({ fn: p.fn, v: blendTowardIdentity(p.fn, p.v, s) }));
  // Coalesce duplicates (sum-or-multiply by function) so two
  // brightness() entries don't fight each other.
  parts = coalesce(parts);
  return parts.map((p) => stringifyPart(p)).join(" ") || "none";
}

function parseFilter(s) {
  const out = [];
  if (!s || s === "none") return out;
  const re = /([a-z-]+)\(([^)]+)\)/gi;
  let m;
  while ((m = re.exec(s))) {
    const fn = m[1].toLowerCase();
    const raw = m[2].trim();
    let v;
    if (raw.endsWith("deg")) v = parseFloat(raw);
    else if (raw.endsWith("%")) v = parseFloat(raw) / 100;
    else v = parseFloat(raw);
    if (Number.isFinite(v)) out.push({ fn, v });
  }
  return out;
}

function blendTowardIdentity(fn, v, s) {
  const id = identityFor(fn);
  return id + (v - id) * s;
}

function identityFor(fn) {
  switch (fn) {
    case "brightness": return 1;
    case "contrast":   return 1;
    case "saturate":   return 1;
    case "grayscale":  return 0;
    case "sepia":      return 0;
    case "invert":     return 0;
    case "hue-rotate": return 0;
    case "blur":       return 0;
    default:           return 0;
  }
}

function coalesce(parts) {
  const map = new Map();
  for (const p of parts) {
    if (!map.has(p.fn)) { map.set(p.fn, p.v); continue; }
    const prev = map.get(p.fn);
    if (p.fn === "hue-rotate") map.set(p.fn, prev + p.v);
    else                       map.set(p.fn, prev * p.v / identityFor(p.fn || "brightness"));
  }
  // Filter out near-identity to keep the chain clean.
  const out = [];
  for (const [fn, v] of map) {
    const id = identityFor(fn);
    if (Math.abs(v - id) < 1e-3) continue;
    out.push({ fn, v });
  }
  return out;
}

function stringifyPart({ fn, v }) {
  if (fn === "hue-rotate") return `hue-rotate(${v.toFixed(1)}deg)`;
  if (fn === "blur") return `blur(${v.toFixed(2)}px)`;
  return `${fn}(${v.toFixed(3)})`;
}

export function decorate(html, state) {
  if (!state || !state.enabled) return html;
  const chain = buildFilterChain(state);
  if (!chain || chain === "none") return html;
  const block = `<style data-colorgrade="css">:root { --cg-filter: ${chain}; } body { filter: var(--cg-filter); }</style>`;
  return html + "\n" + block;
}
