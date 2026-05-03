// inference/hf — HF Inference background removal.
//
// Image: briaai/RMBG-2.0 returns a PNG with alpha (subject on transparent bg).
// We extract the alpha channel as a grayscale mask PNG.
//
// Video: facebook/sam2-hiera-large via HF inference is partial; for v0.1
// we run RMBG-2 on sampled keyframes and bake an SVG mask sequence with
// per-frame <mask> entries. SAM2 native propagation queued for v0.2.

const RMBG_ENDPOINT = "https://api-inference.huggingface.co/models/briaai/RMBG-2.0";

export async function removeBackgroundImage(imageBlob, opts = {}) {
  const headers = { "Content-Type": imageBlob.type || "image/png" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  let resp = await fetch(RMBG_ENDPOINT, { method: "POST", headers, body: imageBlob });
  if (resp.status === 503) {
    const eta = Math.min(30, Math.ceil((await safeJson(resp)).estimated_time ?? 6));
    await sleep(eta * 1000);
    resp = await fetch(RMBG_ENDPOINT, { method: "POST", headers, body: imageBlob });
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`RMBG-2 ${resp.status}: ${t.slice(0, 200)}`);
  }
  const ct = resp.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) {
    // Older endpoint returns base64 in JSON
    const j = await resp.json();
    if (j?.image) {
      const b = await fetch(`data:image/png;base64,${j.image}`).then((r) => r.blob());
      return b;
    }
    throw new Error(`RMBG-2 unexpected response: ${ct}`);
  }
  return await resp.blob();
}

/**
 * Convert an alpha PNG (RMBG output) into a grayscale mask data URL —
 * white=foreground, black=background. The grayscale PNG is what CSS
 * `mask-image: url(...); mask-mode: luminance` consumes.
 */
export async function alphaPngToMaskDataUrl(alphaPng) {
  const bitmap = await createImageBitmap(alphaPng);
  const w = bitmap.width, h = bitmap.height;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  // Pack alpha into all RGB channels; alpha=255 in output.
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    out.data[i] = a; out.data[i + 1] = a; out.data[i + 2] = a; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const blob = await c.convertToBlob({ type: "image/png" });
  return await blobToDataUrl(blob);
}

/**
 * Estimate cutout confidence from the mask alpha distribution: 1.0 if
 * the mask is mostly fully-on or fully-off (clean separation), 0.0 if
 * the histogram is dominated by mid-greys (mushy mask). Cheap proxy
 * for "did the model find a clean subject."
 */
export async function maskConfidence(alphaPng) {
  const bitmap = await createImageBitmap(alphaPng);
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0, mid = 0;
  for (let i = 3; i < data.length; i += 4) {
    n++;
    const a = data[i];
    if (a > 30 && a < 225) mid++;
  }
  return n > 0 ? 1 - mid / n : 0;
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function safeJson(r) { try { return await r.clone().json(); } catch { return {}; } }
