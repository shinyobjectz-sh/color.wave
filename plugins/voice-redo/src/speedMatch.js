// speedMatch — match a regenerated audio blob to a target duration by
// resampling. v0.1 uses a simple linear time-stretch (changes pitch) —
// acceptable for ≤±10% deviation. v0.2 swaps in WSOLA / SoundTouch.js
// for pitch-preserving stretch.
//
// Pipeline:
//   1. decode incoming MP3 → Float32 mono
//   2. compute stretch ratio = target / current
//   3. resample with linear interpolation
//   4. encode back to WAV (avoids MP3 dependency)
//
// Returns a fresh Blob.

import { decodeToMono16k, pcmToWav, SAMPLE_RATE } from "./decode.js";

const MAX_STRETCH = 1.18;
const MIN_STRETCH = 0.82;

export async function matchDuration(mp3Blob, targetDurationS) {
  const { pcm, durationS } = await decodeToMono16k(mp3Blob);
  const rawRatio = durationS / targetDurationS;
  const ratio = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, rawRatio));
  if (Math.abs(ratio - 1) < 0.01) {
    return { blob: pcmToWav(pcm), pitchedRatio: 1 };
  }
  const outLen = Math.round(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src), i1 = Math.min(pcm.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
  }
  return { blob: pcmToWav(out, SAMPLE_RATE), pitchedRatio: ratio };
}

export const SPEED_MATCH_BOUNDS = { min: MIN_STRETCH, max: MAX_STRETCH };
