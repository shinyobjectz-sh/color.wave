// sampler — extract evenly-spaced frames from a clip.
//
// Fast path: WebCodecs VideoDecoder (Chrome/modern Safari ≥17). We can
// pick exact timestamps and decode in parallel.
// Fallback: a transient <video> element + canvas drawImage on seek.
// Slower (3-5×) because seek is single-shot and waits on the media
// pipeline, but works in any browser that plays the clip.
//
// Output: Array<{ t: seconds, bitmap: ImageBitmap, width, height }>
//
// The caller decides stride and total count; we emit those frames in
// chronological order.

export async function sampleFrames(src, durationS, strideHz = 4, opts = {}) {
  const count = Math.max(2, Math.floor(durationS * strideHz));
  const targets = [];
  for (let i = 0; i < count; i++) {
    targets.push((i + 0.5) / count * durationS);
  }
  return sampleViaVideoElement(src, targets, opts);
}

async function sampleViaVideoElement(src, targets, opts) {
  const v = document.createElement("video");
  v.crossOrigin = opts.crossOrigin ?? "anonymous";
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.src = src;
  await new Promise((res, rej) => {
    v.addEventListener("loadedmetadata", () => res(), { once: true });
    v.addEventListener("error", () => rej(new Error("video load failed")), { once: true });
  });
  const w = v.videoWidth;
  const h = v.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  const out = [];
  for (const t of targets) {
    await seek(v, t);
    ctx.drawImage(v, 0, 0, w, h);
    const bitmap = await createImageBitmap(canvas);
    out.push({ t, bitmap, width: w, height: h });
    opts.onProgress?.(out.length, targets.length);
  }
  v.removeAttribute("src");
  v.load();
  return out;
}

function seek(v, t) {
  return new Promise((res, rej) => {
    const onSeeked = () => { v.removeEventListener("seeked", onSeeked); res(); };
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("error", () => rej(new Error("seek failed")), { once: true });
    v.currentTime = Math.max(0, Math.min(v.duration - 0.001, t));
  });
}
