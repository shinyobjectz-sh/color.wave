// detect/transformers-yolos — transformers.js yolos-tiny detector.
//
// v0.1 default. Pure JS, ~28 MB weight download (cached in browser).
// Replace with candle-yolov8n in v0.2 once packages/workbook-runtime-wasm/
// has the yolov8 binding.

const CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
const MODEL_ID = "Xenova/yolos-tiny";

let detector = null;
let loadPromise = null;

export async function loadDetector(onProgress) {
  if (detector) return detector;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const tx = await import(/* @vite-ignore */ /* webpackIgnore: true */ CDN + "/+esm");
    tx.env.allowLocalModels = false;
    tx.env.useBrowserCache = true;
    detector = await tx.pipeline("object-detection", MODEL_ID, {
      progress_callback: (p) => {
        if (p?.status === "progress" && p?.total) {
          onProgress?.(p.loaded ?? 0, p.total);
        }
      },
    });
    return detector;
  })();
  return loadPromise;
}

/**
 * Run detection on an ImageBitmap. Returns dets in source-image pixel
 * coords with cx/cy/w/h.
 */
export async function detectBitmap(bitmap, opts = {}) {
  const det = await loadDetector(opts.onProgress);
  // transformers.js accepts a canvas/HTMLImage/ImageData; convert bitmap.
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  // Threshold lower than typical (0.4) so the associator has more
  // candidates to choose from.
  const out = await det(canvas, { threshold: opts.threshold ?? 0.3, percentage: false });
  return out.map((o) => {
    const { xmin, ymin, xmax, ymax } = o.box;
    return {
      cls: o.label,
      conf: o.score,
      cx: (xmin + xmax) / 2,
      cy: (ymin + ymax) / 2,
      w: xmax - xmin,
      h: ymax - ymin,
    };
  });
}

export function classFilter(dets, classes) {
  if (!classes) return dets;
  return dets.filter((d) => classes.includes(d.cls));
}
