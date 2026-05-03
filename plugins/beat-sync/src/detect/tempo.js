// tempo — estimate BPM via autocorrelation of the onset-flux envelope,
// then phase-align beat grid to the strongest onset peaks.
//
// Output: { bpm, beats: [{ t, conf, downbeat }] }

const MIN_BPM = 70;
const MAX_BPM = 200;

export function estimateBeats(fluxes, fps) {
  const bpm = autocorrBPM(fluxes, fps);
  const beatPeriodS = 60 / bpm;
  const totalS = fluxes.length / fps;
  // Find the best phase: try N candidate offsets in [0, beatPeriodS),
  // pick the one whose comb maximizes total flux at beat positions.
  const offsets = 32;
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let p = 0; p < offsets; p++) {
    const phase = (p / offsets) * beatPeriodS;
    let score = 0;
    for (let t = phase; t < totalS; t += beatPeriodS) {
      const idx = Math.round(t * fps);
      if (idx >= 0 && idx < fluxes.length) score += fluxes[idx];
    }
    if (score > bestScore) { bestScore = score; bestPhase = phase; }
  }
  const beats = [];
  for (let t = bestPhase, i = 0; t < totalS; t += beatPeriodS, i++) {
    const idx = Math.round(t * fps);
    const conf = idx >= 0 && idx < fluxes.length ? Math.min(1, fluxes[idx] / (avg(fluxes) * 4 + 1e-6)) : 0;
    beats.push({ t: round3(t), conf: round3(conf), downbeat: i % 4 === 0 });
  }
  return { bpm: round1(bpm), beats };
}

function autocorrBPM(fluxes, fps) {
  const minLag = Math.floor((60 / MAX_BPM) * fps);
  const maxLag = Math.ceil((60 / MIN_BPM) * fps);
  let best = 0, bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < fluxes.length; i++) sum += fluxes[i] * fluxes[i - lag];
    if (sum > bestVal) { bestVal = sum; best = lag; }
  }
  // Anti-tempo-halving: if BPM < 100 but 2x BPM also scores well,
  // prefer 2x (most modern music sits in 110-140 range).
  const halfLag = Math.round(best / 2);
  if (halfLag >= minLag) {
    let sum2 = 0;
    for (let i = halfLag; i < fluxes.length; i++) sum2 += fluxes[i] * fluxes[i - halfLag];
    if (sum2 > bestVal * 0.85 && (60 * fps) / best < 100) best = halfLag;
  }
  return (60 * fps) / best;
}

function avg(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / Math.max(1, arr.length);
}
function round3(x) { return Math.round(x * 1000) / 1000; }
function round1(x) { return Math.round(x * 10) / 10; }
