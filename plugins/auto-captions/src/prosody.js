// prosody — per-word RMS loudness, normalized to [0,1] across the clip.
//
// Algorithm: 25 ms RMS frames, then per-word max(rms) inside [t, t+d].
// Quantile-normalize: a word lands at the 95th percentile → 1.0; at
// the 10th → 0.0. Robust to per-clip volume normalization.

const FRAME_MS = 25;

export function analyzeProsody(words, pcm, sampleRate) {
  const frameLen = Math.floor((FRAME_MS / 1000) * sampleRate);
  const frameCount = Math.floor(pcm.length / frameLen);
  const rmsFrames = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const off = f * frameLen;
    for (let i = 0; i < frameLen; i++) {
      const x = pcm[off + i];
      sum += x * x;
    }
    rmsFrames[f] = Math.sqrt(sum / frameLen);
  }
  const wordPeaks = words.map((w) => {
    const a = Math.floor((w.t * 1000) / FRAME_MS);
    const b = Math.min(frameCount - 1, Math.ceil(((w.t + w.d) * 1000) / FRAME_MS));
    let peak = 0;
    for (let i = a; i <= b; i++) if (rmsFrames[i] > peak) peak = rmsFrames[i];
    return peak;
  });
  const sorted = wordPeaks.slice().sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.10)] ?? 0;
  const hi = sorted[Math.floor(sorted.length * 0.95)] ?? 1;
  const range = Math.max(1e-6, hi - lo);
  return words.map((w, i) => ({
    ...w,
    rms: Math.max(0, Math.min(1, (wordPeaks[i] - lo) / range)),
  }));
}
