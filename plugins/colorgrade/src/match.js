// match — drop a reference image, get a CSS filter chain that
// approximates its color grade.
//
// v0.1 strategy: compute the reference's mean luminance, mean RGB,
// per-channel std-dev, and a weighted hue centroid. Fit those to a
// `brightness contrast saturate hue-rotate sepia` chain via closed-form
// approximations. WebGL+Hald path with full per-channel CDF + 3D LUT
// is queued for v0.2.
//
// This is intentionally less rigorous than the dossier's CDF-match
// algorithm: in CSS-only output, a 5-parameter filter chain can't
// represent the full LUT anyway, so per-channel mean+std is the right
// fidelity target.

const SAMPLE_DIM = 128;

export async function matchReference(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(SAMPLE_DIM, SAMPLE_DIM);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, SAMPLE_DIM, SAMPLE_DIM);
  const data = ctx.getImageData(0, 0, SAMPLE_DIM, SAMPLE_DIM).data;

  const stats = computeStats(data);
  return statsToFilter(stats);
}

function computeStats(data) {
  let sumR = 0, sumG = 0, sumB = 0;
  let sumR2 = 0, sumG2 = 0, sumB2 = 0;
  let sumLum = 0;
  let n = 0;
  // Hue histogram (HSV) at 24 bins for hue-rotate fitting.
  const hueBins = new Float32Array(24);
  let totalSat = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    sumR += r; sumG += g; sumB += b;
    sumR2 += r * r; sumG2 += g * g; sumB2 += b * b;
    sumLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max, d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const bin = Math.floor((h / 360) * 24) % 24;
    hueBins[bin] += s; // weight by saturation
    totalSat += s;
    n++;
  }
  const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;
  const varR = sumR2 / n - meanR * meanR;
  const varG = sumG2 / n - meanG * meanG;
  const varB = sumB2 / n - meanB * meanB;
  const meanLum = sumLum / n;
  const meanVar = (varR + varG + varB) / 3;
  const meanSat = totalSat / n;
  // Weighted circular mean of hue histogram, in degrees.
  let sx = 0, sy = 0;
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    sx += hueBins[i] * Math.cos(ang);
    sy += hueBins[i] * Math.sin(ang);
  }
  const hueCentroid = (Math.atan2(sy, sx) * 180) / Math.PI;
  return { meanR, meanG, meanB, meanLum, meanVar, meanSat, hueCentroid };
}

/**
 * Convert reference statistics to a CSS filter chain that nudges a
 * neutral image toward those stats:
 *
 *   - brightness   from meanLum (target ~ 0.5 = neutral; ratio of ref to neutral)
 *   - contrast     from meanVar (target ~ 1/12 = uniform; sqrt ratio)
 *   - saturate     from meanSat (target ~ 0.30 = average mid sat)
 *   - hue-rotate   from hueCentroid offset relative to a "warm orange" baseline
 *   - sepia        from R-vs-B imbalance (warmer images get more sepia)
 */
function statsToFilter({ meanLum, meanVar, meanSat, meanR, meanB, hueCentroid }) {
  const brightness = clamp(0.5 + (meanLum - 0.5) * 0.6, 0.85, 1.20).toFixed(3);
  const baseVar = 1 / 12;
  const contrast = clamp(Math.sqrt((meanVar + 1e-3) / (baseVar + 1e-3)), 0.80, 1.45).toFixed(3);
  const saturate = clamp(meanSat / 0.30, 0.50, 1.60).toFixed(3);
  const baselineHue = 30; // orange-warm reference
  let hueDelta = hueCentroid - baselineHue;
  if (hueDelta > 180) hueDelta -= 360;
  if (hueDelta < -180) hueDelta += 360;
  const hueRotate = clamp(hueDelta * 0.5, -45, 45).toFixed(1);
  const warmth = clamp((meanR - meanB) * 0.6, 0, 0.30).toFixed(3);
  const sepia = parseFloat(warmth);
  const parts = [
    `brightness(${brightness})`,
    `contrast(${contrast})`,
    `saturate(${saturate})`,
  ];
  if (Math.abs(parseFloat(hueRotate)) > 1) parts.push(`hue-rotate(${hueRotate}deg)`);
  if (sepia > 0.02) parts.push(`sepia(${sepia.toFixed(3)})`);
  return parts.join(" ");
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
