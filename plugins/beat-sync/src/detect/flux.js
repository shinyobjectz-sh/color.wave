// flux — spectral flux onset detector.
//
// Hop = 512 samples, FFT = 1024. Per-hop spectral flux = sum of positive
// deltas in magnitude vs previous frame. Peaks above an adaptive median
// threshold are onsets. Output: [{ t: seconds, flux: scalar }]
//
// We don't ship a full FFT lib — we do a tiny radix-2 Cooley-Tukey
// inline. 80 lines, no deps, fast enough for ~30s of audio in <100ms.

const HOP = 512;
const FFT = 1024;

export function detectOnsets(pcm, sampleRate) {
  const onsets = [];
  const window = hann(FFT);
  let prev = null;
  const fluxes = [];
  for (let off = 0; off + FFT <= pcm.length; off += HOP) {
    const re = new Float32Array(FFT);
    const im = new Float32Array(FFT);
    for (let i = 0; i < FFT; i++) re[i] = pcm[off + i] * window[i];
    fft(re, im);
    const mag = new Float32Array(FFT / 2);
    for (let i = 0; i < FFT / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    if (prev) {
      let f = 0;
      for (let i = 0; i < FFT / 2; i++) {
        const d = mag[i] - prev[i];
        if (d > 0) f += d;
      }
      fluxes.push(f);
    } else {
      fluxes.push(0);
    }
    prev = mag;
  }
  // Adaptive threshold: median over a sliding window of 25 hops, scaled.
  const winSize = 25;
  for (let i = 1; i < fluxes.length - 1; i++) {
    const lo = Math.max(0, i - winSize);
    const hi = Math.min(fluxes.length, i + winSize);
    const slice = fluxes.slice(lo, hi).slice().sort((a, b) => a - b);
    const med = slice[Math.floor(slice.length / 2)] || 0;
    const thr = med * 1.4 + 1e-3;
    if (fluxes[i] > thr && fluxes[i] > fluxes[i - 1] && fluxes[i] >= fluxes[i + 1]) {
      onsets.push({ t: (i * HOP) / sampleRate, flux: fluxes[i] });
    }
  }
  return { onsets, fluxes, fps: sampleRate / HOP };
}

function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function fft(re, im) {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cRe = 1, cIm = 0;
      for (let k = 0; k < half; k++) {
        const tRe = cRe * re[i + k + half] - cIm * im[i + k + half];
        const tIm = cRe * im[i + k + half] + cIm * re[i + k + half];
        re[i + k + half] = re[i + k] - tRe;
        im[i + k + half] = im[i + k] - tIm;
        re[i + k] += tRe;
        im[i + k] += tIm;
        const ncRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = ncRe;
      }
    }
  }
}
