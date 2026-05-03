// solver — smoothed bbox path + target ratio → CSS @keyframes block.
//
// Pipeline:
//   1. fill gaps (NaN frames) via cubic interpolation between neighbors
//   2. low-pass cx, cy, area via Gaussian convolution (σ ≈ 4 samples)
//   3. velocity-clamp to maxPanPx/s
//   4. compute crop window for target ratio at each t
//   5. emit @keyframes percentages: 0%, every Nth sample, 100%
//
// The output transform is applied to the source <video>; the crop is
// achieved with parent overflow:hidden + clip-path inset.

export function solvePath(track, frameW, frameH, ratio, durationS, constraints) {
  const filled = gapFill(track, frameW, frameH);
  const smoothed = gaussianSmooth(filled, constraints.smoothSigmaSamples);
  const limited = clampVelocity(smoothed, frameW, durationS, constraints.maxPanPxPerSec);
  return limited.map((s) => {
    const { tx, ty, scale } = transformFor(s, frameW, frameH, ratio);
    return { t: s.t, tx, ty, scale };
  });
}

function gapFill(track, fw, fh) {
  const out = track.slice();
  const ok = (i) => Number.isFinite(out[i]?.cx);
  const lastOk = () => { for (let i = out.length - 1; i >= 0; i--) if (ok(i)) return i; return -1; };
  const firstOk = () => { for (let i = 0; i < out.length; i++) if (ok(i)) return i; return -1; };
  const f = firstOk(), l = lastOk();
  if (f < 0) {
    // No detections — center on every frame.
    return out.map((s) => ({ ...s, cx: fw / 2, cy: fh / 2, w: fw / 2, h: fh / 2 }));
  }
  for (let i = 0; i < f; i++) out[i] = { ...out[f], t: out[i].t };
  for (let i = l + 1; i < out.length; i++) out[i] = { ...out[l], t: out[i].t };
  for (let i = f; i <= l; i++) {
    if (ok(i)) continue;
    let a = i - 1; while (a >= 0 && !ok(a)) a--;
    let b = i + 1; while (b < out.length && !ok(b)) b++;
    if (a < 0 || b >= out.length) { out[i] = { ...out[Math.max(0, a)], t: out[i].t }; continue; }
    const u = (out[i].t - out[a].t) / (out[b].t - out[a].t);
    out[i] = {
      t: out[i].t,
      cx: lerp(out[a].cx, out[b].cx, u),
      cy: lerp(out[a].cy, out[b].cy, u),
      w:  lerp(out[a].w,  out[b].w,  u),
      h:  lerp(out[a].h,  out[b].h,  u),
      conf: 0,
    };
  }
  return out;
}

function gaussianSmooth(track, sigma) {
  if (sigma <= 0) return track;
  const r = Math.max(1, Math.ceil(sigma * 3));
  const kern = [];
  let kSum = 0;
  for (let k = -r; k <= r; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kern.push(w); kSum += w;
  }
  const norm = kern.map((w) => w / kSum);
  const out = [];
  for (let i = 0; i < track.length; i++) {
    let cx = 0, cy = 0, w = 0, h = 0;
    for (let k = -r; k <= r; k++) {
      const j = clamp(i + k, 0, track.length - 1);
      const f = norm[k + r];
      cx += track[j].cx * f;
      cy += track[j].cy * f;
      w  += track[j].w * f;
      h  += track[j].h * f;
    }
    out.push({ ...track[i], cx, cy, w, h });
  }
  return out;
}

function clampVelocity(track, frameW, durationS, maxPxPerS) {
  if (track.length < 2) return track;
  const out = track.slice();
  for (let i = 1; i < out.length; i++) {
    const dt = Math.max(1 / 1000, out[i].t - out[i - 1].t);
    const dx = out[i].cx - out[i - 1].cx;
    const dy = out[i].cy - out[i - 1].cy;
    const v = Math.hypot(dx, dy) / dt;
    if (v > maxPxPerS) {
      const f = maxPxPerS / v;
      out[i] = {
        ...out[i],
        cx: out[i - 1].cx + dx * f,
        cy: out[i - 1].cy + dy * f,
      };
    }
  }
  return out;
}

function transformFor(sample, fw, fh, ratio) {
  const targetAspect = ratio.w / ratio.h;
  // Crop window in source coords: full height if ratio is taller-than-source
  let cropW, cropH;
  const srcAspect = fw / fh;
  if (targetAspect <= srcAspect) {
    cropH = fh;
    cropW = fh * targetAspect;
  } else {
    cropW = fw;
    cropH = fw / targetAspect;
  }
  // We render INTO a viewport of size (fw,fh) (the composition keeps
  // source dims). Scale the source so the crop fills that viewport.
  const scale = Math.max(fw / cropW, fh / cropH);
  // Translate so (cx,cy) lands at viewport center.
  const tx = (fw / 2 - sample.cx) * scale;
  const ty = (fh / 2 - sample.cy) * scale;
  return { tx, ty, scale };
}

/**
 * Emit a CSS @keyframes block + the selector that applies it. clipId
 * must be a stable identifier for the target <video>.
 */
export function emitKeyframes(clipId, track, durationS, ratio, frameW, frameH) {
  const animName = `sr-${clipId}`;
  const lines = [];
  lines.push(`@keyframes ${animName} {`);
  for (const k of track) {
    const pct = clamp((k.t / durationS) * 100, 0, 100).toFixed(2);
    lines.push(`  ${pct}% { transform: translate(${k.tx.toFixed(2)}px, ${k.ty.toFixed(2)}px) scale(${k.scale.toFixed(4)}); }`);
  }
  lines.push("}");
  // The crop window has the target ratio centered in the viewport.
  const targetAspect = ratio.w / ratio.h;
  const srcAspect = frameW / frameH;
  let inset;
  if (targetAspect <= srcAspect) {
    const padPct = (1 - targetAspect / srcAspect) * 50;
    inset = `inset(0 ${padPct.toFixed(2)}% 0 ${padPct.toFixed(2)}%)`;
  } else {
    const padPct = (1 - srcAspect / targetAspect) * 50;
    inset = `inset(${padPct.toFixed(2)}% 0 ${padPct.toFixed(2)}% 0)`;
  }
  lines.push(`[data-smart-reframe="${clipId}"] {`);
  lines.push(`  transform-origin: 0 0;`);
  lines.push(`  animation: ${animName} ${durationS.toFixed(3)}s linear both;`);
  lines.push(`  clip-path: ${inset};`);
  lines.push(`}`);
  return lines.join("\n");
}

function lerp(a, b, u) { return a + (b - a) * u; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
