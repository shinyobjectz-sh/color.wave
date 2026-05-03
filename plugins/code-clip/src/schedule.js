// schedule — char-index → reveal-time table.
//
// Inputs: total chars N, target duration D, bezier curve (4-point cubic
// in normalized [0,1]² space; P0=(0,0), P3=(1,1) fixed), pause hooks
// (line break, semicolon).
//
// Output: Float32Array of length N where out[i] is the cumulative
// reveal time in seconds for character i.

export function buildSchedule(text, totalDur, curve, opts = {}) {
  const N = text.length;
  if (N === 0) return new Float32Array(0);
  const pauseLineBreakMs = opts.pauseLineBreakMs ?? 80;
  const pauseSemicolonMs = opts.pauseSemicolonMs ?? 40;
  // First, sum pause time so we can scale the bezier portion.
  let pauseS = 0;
  for (let i = 0; i < N; i++) {
    const c = text[i];
    if (c === "\n") pauseS += pauseLineBreakMs / 1000;
    else if (c === ";") pauseS += pauseSemicolonMs / 1000;
  }
  const baseDur = Math.max(0.1, totalDur - pauseS);
  const out = new Float32Array(N);
  let cumPause = 0;
  for (let i = 0; i < N; i++) {
    const u = (i + 1) / N;
    const f = bezierY(curve, u);
    out[i] = f * baseDur + cumPause;
    const c = text[i];
    if (c === "\n") cumPause += pauseLineBreakMs / 1000;
    else if (c === ";") cumPause += pauseSemicolonMs / 1000;
  }
  return out;
}

function bezierY(curve, t) {
  const u = 1 - t;
  return 3 * u * u * t * curve.p1.y + 3 * u * t * t * curve.p2.y + t * t * t;
}

export const SPEED_PRESETS = [
  { id: "linear",        label: "Linear",        p1: { x: 0.50, y: 0.50 }, p2: { x: 0.50, y: 0.50 } },
  { id: "human",         label: "Human",         p1: { x: 0.25, y: 0.45 }, p2: { x: 0.65, y: 0.85 } },
  { id: "dramatic-pause",label: "Dramatic pause",p1: { x: 0.70, y: 0.05 }, p2: { x: 0.30, y: 0.95 } },
  { id: "staccato",      label: "Staccato",      p1: { x: 0.10, y: 0.70 }, p2: { x: 0.30, y: 0.90 } },
];

export function findSpeed(id) { return SPEED_PRESETS.find((p) => p.id === id) ?? SPEED_PRESETS[0]; }
