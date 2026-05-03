// video — sample N frames from a clip, run image-mode bg removal on
// each, and stitch into an SVG mask sequence + CSS that swaps via
// step()-easing animation.
//
// One asset per clip. SVG keyframes are quantized to ~8/sec to keep
// the document size reasonable. v0.2 swaps to SAM2 native propagation.

import { removeBackgroundImage, alphaPngToMaskDataUrl } from "./inference/hf.js";

export async function sampleAndMaskVideo(src, durationS, opts = {}) {
  const fps = opts.keyframeHz ?? 4;
  const count = Math.max(1, Math.floor(durationS * fps));
  const targets = [];
  for (let i = 0; i < count; i++) targets.push((i + 0.5) / count * durationS);

  const v = document.createElement("video");
  v.crossOrigin = opts.crossOrigin ?? "anonymous";
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.src = src;
  await new Promise((res, rej) => {
    v.addEventListener("loadedmetadata", () => res(), { once: true });
    v.addEventListener("error", () => rej(new Error("video load")), { once: true });
  });
  const w = v.videoWidth, h = v.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");

  const masks = [];
  for (let i = 0; i < targets.length; i++) {
    await seek(v, targets[i]);
    ctx.drawImage(v, 0, 0, w, h);
    const frameBlob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    opts.onProgress?.(i + 1, targets.length);
    const alphaPng = await removeBackgroundImage(frameBlob, opts);
    const dataUrl = await alphaPngToMaskDataUrl(alphaPng);
    masks.push({ t: targets[i], dataUrl });
  }
  v.removeAttribute("src");
  v.load();
  return { width: w, height: h, durationS, masks, fps };
}

function seek(v, t) {
  return new Promise((res, rej) => {
    const onSeeked = () => { v.removeEventListener("seeked", onSeeked); res(); };
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("error", () => rej(new Error("seek")), { once: true });
    v.currentTime = Math.max(0, Math.min(v.duration - 0.001, t));
  });
}
