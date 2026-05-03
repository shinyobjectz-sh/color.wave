// associate — pick a single subject across sampled frames using
// IoU + center-distance greedy matching to last accepted bbox.
//
// Input: Array<{ t, dets: [{cx, cy, w, h, conf, cls}] }>
// Output: Array<{ t, cx, cy, w, h, conf }>  — one row per frame, may
//         contain { cx, cy, w, h: NaN } for frames where no det matched.
//
// Why greedy + IoU+distance: trackers (sort, deepsort) overkill here;
// we sample at 2-4 Hz and the subject barely moves between samples.
// Largest-area-on-first-frame wins, then carry that subject forward.

const MAX_CENTER_DIST_FRAC = 0.35; // within 35% of frame width
const MIN_IOU_NEW = 0.10;          // anchor jump if iou drops below this

export function associate(detsByFrame, frameW, frameH) {
  // Find best anchor on first frame: largest area (or specified class).
  const out = [];
  let prev = null;
  for (let i = 0; i < detsByFrame.length; i++) {
    const { t, dets } = detsByFrame[i];
    if (!dets.length) {
      out.push({ t, cx: NaN, cy: NaN, w: NaN, h: NaN, conf: 0 });
      continue;
    }
    let pick;
    if (!prev) {
      // first detection: largest by area
      pick = dets.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    } else {
      // greedy: best score combining IoU + inverse center distance
      const maxDist = MAX_CENTER_DIST_FRAC * Math.max(frameW, frameH);
      pick = dets
        .map((d) => ({
          d,
          score: iou(d, prev) * 0.6 + (1 - distNorm(d, prev, maxDist)) * 0.4 + d.conf * 0.05,
        }))
        .sort((a, b) => b.score - a.score)[0]?.d;
      if (!pick || iou(pick, prev) < MIN_IOU_NEW) {
        // anchor lost — re-anchor by largest area, but keep going
        pick = dets.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
      }
    }
    prev = pick;
    out.push({ t, cx: pick.cx, cy: pick.cy, w: pick.w, h: pick.h, conf: pick.conf });
  }
  return out;
}

function iou(a, b) {
  const ax0 = a.cx - a.w / 2, ax1 = a.cx + a.w / 2;
  const ay0 = a.cy - a.h / 2, ay1 = a.cy + a.h / 2;
  const bx0 = b.cx - b.w / 2, bx1 = b.cx + b.w / 2;
  const by0 = b.cy - b.h / 2, by1 = b.cy + b.h / 2;
  const ix = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0));
  const iy = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function distNorm(a, b, maxDist) {
  const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  return Math.min(1, d / maxDist);
}
