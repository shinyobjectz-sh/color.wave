// src/presets.js
var RATIOS = [
  { id: "9:16", label: "Vertical (9:16)", w: 9, h: 16 },
  { id: "1:1", label: "Square (1:1)", w: 1, h: 1 },
  { id: "4:5", label: "Portrait (4:5)", w: 4, h: 5 },
  { id: "2.39:1", label: "Anamorphic (2.39:1)", w: 2.39, h: 1 },
  { id: "16:9", label: "Landscape (16:9)", w: 16, h: 9 }
];
function findRatio(id) {
  return RATIOS.find((r) => r.id === id) ?? RATIOS[0];
}
var SUBJECT_MODES = [
  { id: "person", label: "Person", classes: ["person"] },
  { id: "face", label: "Face only", classes: ["__face__"] },
  // routes to MediaPipe
  {
    id: "largest-object",
    label: "Largest object",
    classes: null
    /* any */
  }
];
var DEFAULTS = {
  ratioId: "9:16",
  subjectMode: "person",
  sampleStrideHz: 4,
  // 4 fps sampling — good cost/quality balance
  smoothSigmaSamples: 4,
  // Gaussian smoothing window in sample units
  maxPanPxPerSec: 250,
  maxZoomPctPerSec: 30,
  minConf: 0.4
};

// src/sampler.js
async function sampleFrames(src, durationS, strideHz = 4, opts = {}) {
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
  canvas.width = w;
  canvas.height = h;
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
    const onSeeked = () => {
      v.removeEventListener("seeked", onSeeked);
      res();
    };
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("error", () => rej(new Error("seek failed")), { once: true });
    v.currentTime = Math.max(0, Math.min(v.duration - 1e-3, t));
  });
}

// src/detect/transformers-yolos.js
var CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
var MODEL_ID = "Xenova/yolos-tiny";
var detector = null;
var loadPromise = null;
async function loadDetector(onProgress) {
  if (detector) return detector;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const tx = await import(
      /* @vite-ignore */
      /* webpackIgnore: true */
      CDN + "/+esm"
    );
    tx.env.allowLocalModels = false;
    tx.env.useBrowserCache = true;
    detector = await tx.pipeline("object-detection", MODEL_ID, {
      progress_callback: (p) => {
        if (p?.status === "progress" && p?.total) {
          onProgress?.(p.loaded ?? 0, p.total);
        }
      }
    });
    return detector;
  })();
  return loadPromise;
}
async function detectBitmap(bitmap, opts = {}) {
  const det = await loadDetector(opts.onProgress);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const out = await det(canvas, { threshold: opts.threshold ?? 0.3, percentage: false });
  return out.map((o) => {
    const { xmin, ymin, xmax, ymax } = o.box;
    return {
      cls: o.label,
      conf: o.score,
      cx: (xmin + xmax) / 2,
      cy: (ymin + ymax) / 2,
      w: xmax - xmin,
      h: ymax - ymin
    };
  });
}
function classFilter(dets, classes) {
  if (!classes) return dets;
  return dets.filter((d) => classes.includes(d.cls));
}

// src/associate.js
var MAX_CENTER_DIST_FRAC = 0.35;
var MIN_IOU_NEW = 0.1;
function associate(detsByFrame, frameW, frameH) {
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
      pick = dets.reduce((a, b) => a.w * a.h >= b.w * b.h ? a : b);
    } else {
      const maxDist = MAX_CENTER_DIST_FRAC * Math.max(frameW, frameH);
      pick = dets.map((d) => ({
        d,
        score: iou(d, prev) * 0.6 + (1 - distNorm(d, prev, maxDist)) * 0.4 + d.conf * 0.05
      })).sort((a, b) => b.score - a.score)[0]?.d;
      if (!pick || iou(pick, prev) < MIN_IOU_NEW) {
        pick = dets.reduce((a, b) => a.w * a.h >= b.w * b.h ? a : b);
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

// src/solver.js
function solvePath(track, frameW, frameH, ratio, durationS, constraints) {
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
  const lastOk = () => {
    for (let i = out.length - 1; i >= 0; i--) if (ok(i)) return i;
    return -1;
  };
  const firstOk = () => {
    for (let i = 0; i < out.length; i++) if (ok(i)) return i;
    return -1;
  };
  const f = firstOk(), l = lastOk();
  if (f < 0) {
    return out.map((s) => ({ ...s, cx: fw / 2, cy: fh / 2, w: fw / 2, h: fh / 2 }));
  }
  for (let i = 0; i < f; i++) out[i] = { ...out[f], t: out[i].t };
  for (let i = l + 1; i < out.length; i++) out[i] = { ...out[l], t: out[i].t };
  for (let i = f; i <= l; i++) {
    if (ok(i)) continue;
    let a = i - 1;
    while (a >= 0 && !ok(a)) a--;
    let b = i + 1;
    while (b < out.length && !ok(b)) b++;
    if (a < 0 || b >= out.length) {
      out[i] = { ...out[Math.max(0, a)], t: out[i].t };
      continue;
    }
    const u = (out[i].t - out[a].t) / (out[b].t - out[a].t);
    out[i] = {
      t: out[i].t,
      cx: lerp(out[a].cx, out[b].cx, u),
      cy: lerp(out[a].cy, out[b].cy, u),
      w: lerp(out[a].w, out[b].w, u),
      h: lerp(out[a].h, out[b].h, u),
      conf: 0
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
    kern.push(w);
    kSum += w;
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
      w += track[j].w * f;
      h += track[j].h * f;
    }
    out.push({ ...track[i], cx, cy, w, h });
  }
  return out;
}
function clampVelocity(track, frameW, durationS, maxPxPerS) {
  if (track.length < 2) return track;
  const out = track.slice();
  for (let i = 1; i < out.length; i++) {
    const dt = Math.max(1 / 1e3, out[i].t - out[i - 1].t);
    const dx = out[i].cx - out[i - 1].cx;
    const dy = out[i].cy - out[i - 1].cy;
    const v = Math.hypot(dx, dy) / dt;
    if (v > maxPxPerS) {
      const f = maxPxPerS / v;
      out[i] = {
        ...out[i],
        cx: out[i - 1].cx + dx * f,
        cy: out[i - 1].cy + dy * f
      };
    }
  }
  return out;
}
function transformFor(sample, fw, fh, ratio) {
  const targetAspect = ratio.w / ratio.h;
  let cropW, cropH;
  const srcAspect = fw / fh;
  if (targetAspect <= srcAspect) {
    cropH = fh;
    cropW = fh * targetAspect;
  } else {
    cropW = fw;
    cropH = fw / targetAspect;
  }
  const scale = Math.max(fw / cropW, fh / cropH);
  const tx = (fw / 2 - sample.cx) * scale;
  const ty = (fh / 2 - sample.cy) * scale;
  return { tx, ty, scale };
}
function emitKeyframes(clipId, track, durationS, ratio, frameW, frameH) {
  const animName = `sr-${clipId}`;
  const lines = [];
  lines.push(`@keyframes ${animName} {`);
  for (const k of track) {
    const pct = clamp(k.t / durationS * 100, 0, 100).toFixed(2);
    lines.push(`  ${pct}% { transform: translate(${k.tx.toFixed(2)}px, ${k.ty.toFixed(2)}px) scale(${k.scale.toFixed(4)}); }`);
  }
  lines.push("}");
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
function lerp(a, b, u) {
  return a + (b - a) * u;
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// src/compose.js
function tagVideo(html, clipMatcher, clipId) {
  const re = /<(video)\b([^>]*)>/gi;
  let mutated = false;
  const out = html.replace(re, (full, tag, attrs) => {
    if (mutated) return full;
    if (!clipMatcher(attrs)) return full;
    mutated = true;
    const cleaned = attrs.replace(/\sdata-smart-reframe="[^"]*"/, "");
    return `<${tag}${cleaned} data-smart-reframe="${clipId}">`;
  });
  if (!mutated) throw new Error("smart-reframe: no <video> matched");
  return out;
}
function makeClipMatcher({ start, duration }) {
  return (attrs) => {
    const s = parseFloat(pickAttr(attrs, "data-start"));
    const d = parseFloat(pickAttr(attrs, "data-duration"));
    return Number.isFinite(s) && Number.isFinite(d) && Math.abs(s - start) < 0.01 && Math.abs(d - duration) < 0.01;
  };
}
function pickAttr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}

// src/clip-id.js
async function clipIdOf(src, start, duration) {
  const enc = new TextEncoder().encode(`${src}|${start.toFixed(3)}|${duration.toFixed(3)}`);
  if (crypto.subtle?.digest) {
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381;
  for (let i = 0; i < enc.length; i++) h = (h << 5) + h + enc[i] >>> 0;
  return h.toString(16).padStart(8, "0");
}

// src/ui/pathPanel.js
function mountPathPanel(root, deps) {
  const { onSolve, onRatioChange, onModeChange } = deps;
  root.innerHTML = `
    <div class="sr-wrap">
      <header class="sr-head">
        <div class="sr-title">smart-reframe</div>
        <div class="sr-clip-name">\u2014 pick a clip from the timeline \u2014</div>
      </header>

      <div class="sr-controls">
        <label>ratio
          <select class="sr-ratio">
            <option value="9:16">9:16 vertical</option>
            <option value="1:1">1:1 square</option>
            <option value="4:5">4:5 portrait</option>
            <option value="2.39:1">2.39:1 cinema</option>
            <option value="16:9">16:9 landscape</option>
          </select>
        </label>
        <label>subject
          <select class="sr-mode">
            <option value="person">Person</option>
            <option value="face">Face</option>
            <option value="largest-object">Largest object</option>
          </select>
        </label>
        <button class="sr-solve" disabled>Solve</button>
      </div>

      <div class="sr-section">
        <div class="sr-section-label">path</div>
        <svg class="sr-svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet"></svg>
      </div>

      <div class="sr-section">
        <div class="sr-section-label">thumbnails</div>
        <div class="sr-thumbs"></div>
      </div>

      <div class="sr-status"></div>
    </div>
    <style>
      .sr-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .sr-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .sr-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .sr-clip-name { color: var(--color-fg); }
      .sr-controls { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 10px; }
      .sr-controls label { display: flex; flex-direction: column; gap: 2px; color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .sr-controls select { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: 11px ui-monospace, monospace; }
      .sr-solve { align-self: end; padding: 6px 12px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .sr-solve:disabled { opacity: 0.4; cursor: not-allowed; }
      .sr-section { margin-bottom: 10px; }
      .sr-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .sr-svg { width: 100%; aspect-ratio: 16/9; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; }
      .sr-thumbs { display: flex; gap: 2px; overflow-x: auto; height: 48px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; padding: 2px; }
      .sr-thumbs canvas { height: 100%; width: auto; border-radius: 2px; flex-shrink: 0; }
      .sr-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .sr-status.err { color: rgb(255, 120, 120); }
    </style>
  `;
  const ratioSel = root.querySelector(".sr-ratio");
  const modeSel = root.querySelector(".sr-mode");
  const solveBtn = root.querySelector(".sr-solve");
  const svg = root.querySelector(".sr-svg");
  const thumbsEl = root.querySelector(".sr-thumbs");
  const statusEl = root.querySelector(".sr-status");
  const clipNameEl = root.querySelector(".sr-clip-name");
  ratioSel.addEventListener("change", () => onRatioChange?.(ratioSel.value));
  modeSel.addEventListener("change", () => onModeChange?.(modeSel.value));
  solveBtn.addEventListener("click", () => onSolve?.());
  function setStatus(msg, isErr = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!isErr);
  }
  function setSize(w, h) {
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  function renderPath(track, ratio, fw, fh) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ns = "http://www.w3.org/2000/svg";
    const border = document.createElementNS(ns, "rect");
    border.setAttribute("x", 0);
    border.setAttribute("y", 0);
    border.setAttribute("width", fw);
    border.setAttribute("height", fh);
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", "rgba(255,255,255,0.08)");
    border.setAttribute("stroke-width", 2);
    svg.appendChild(border);
    const targetAspect = ratio.w / ratio.h;
    const srcAspect = fw / fh;
    let cropW, cropH;
    if (targetAspect <= srcAspect) {
      cropH = fh;
      cropW = fh * targetAspect;
    } else {
      cropW = fw;
      cropH = fw / targetAspect;
    }
    const pts = track.filter((t) => Number.isFinite(t.cx)).map((t) => `${t.cx},${t.cy}`).join(" ");
    const poly = document.createElementNS(ns, "polyline");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "rgb(0, 220, 255)");
    poly.setAttribute("stroke-width", 4);
    poly.setAttribute("stroke-linecap", "round");
    svg.appendChild(poly);
    if (track.length) {
      const first = track[0];
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x", first.cx - cropW / 2);
      r.setAttribute("y", first.cy - cropH / 2);
      r.setAttribute("width", cropW);
      r.setAttribute("height", cropH);
      r.setAttribute("fill", "none");
      r.setAttribute("stroke", "rgba(0, 220, 255, 0.4)");
      r.setAttribute("stroke-dasharray", "8 6");
      r.setAttribute("stroke-width", 3);
      svg.appendChild(r);
    }
  }
  function renderThumbs(frames) {
    thumbsEl.innerHTML = "";
    for (const f of frames.slice(0, 16)) {
      const c = document.createElement("canvas");
      const ratio = f.width / f.height;
      c.height = 44;
      c.width = Math.round(44 * ratio);
      c.getContext("2d").drawImage(f.bitmap, 0, 0, c.width, c.height);
      thumbsEl.appendChild(c);
    }
  }
  return {
    setClip(label) {
      clipNameEl.textContent = label;
      solveBtn.disabled = false;
    },
    setRatio(id) {
      ratioSel.value = id;
    },
    setMode(id) {
      modeSel.value = id;
    },
    setSize,
    setStatus,
    setBusy(b) {
      solveBtn.disabled = b;
    },
    renderPath,
    renderThumbs,
    destroy() {
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "smart-reframe",
  name: "Smart Reframe",
  version: "0.1.0",
  description: "Subject-aware aspect-ratio reframe. Solves a smooth pan/zoom path that keeps the main subject in frame.",
  icon: "\u25AD",
  surfaces: ["timeline-clip-actions", "panels", "settings", "composition-decorators"],
  permissions: ["network:cdn.jsdelivr.net", "storage:cache-api"]
};
async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { ...DEFAULTS };
  let activeClip = null;
  let activeRatioId = defaults.ratioId;
  let activeMode = defaults.subjectMode;
  let panel = null;
  wb.composition.addRenderDecorator({
    priority: 80,
    transform(html) {
      if (!html.includes("data-smart-reframe=")) return html;
      const ids = uniqueClipIds(html);
      const blocks = [];
      for (const id of ids) {
        const path = wb.storage.get(`paths.${id}`);
        if (!path) continue;
        const ratio = findRatio(path.ratioId);
        const css = emitKeyframes(id, path.keyframes, path.durationS, ratio, path.frameW, path.frameH);
        blocks.push(css);
      }
      if (!blocks.length) return html;
      return html + `
<style data-smart-reframe-keyframes>
${blocks.join("\n\n")}
</style>
`;
    }
  });
  wb.timeline.addClipAction({
    icon: "\u25AD",
    label: "Reframe\u2026",
    when: (clip) => clip && clip.tagName === "video",
    async onClick(clip) {
      activeClip = clip;
      panel?.setClip(clip.label || `clip @${clip.start.toFixed(1)}s`);
      panel?.setStatus("ready \u2014 pick ratio + Solve");
    }
  });
  wb.panels.addTab({
    id: "smart-reframe",
    label: "Reframe",
    icon: "\u25AD",
    component: null,
    mount(root) {
      panel = mountPathPanel(root, {
        onRatioChange: (id) => {
          activeRatioId = id;
          defaults = { ...defaults, ratioId: id };
          wb.storage.set("defaults", defaults);
        },
        onModeChange: (id) => {
          activeMode = id;
          defaults = { ...defaults, subjectMode: id };
          wb.storage.set("defaults", defaults);
        },
        async onSolve() {
          return runSolve();
        }
      });
      panel.setRatio(activeRatioId);
      panel.setMode(activeMode);
      if (activeClip) panel.setClip(activeClip.label || `clip @${activeClip.start.toFixed(1)}s`);
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.settings.addSection({
    label: "Smart Reframe",
    mount(root) {
      root.innerHTML = `
        <div class="sr-settings">
          <label>default ratio
            <select class="sr-d-ratio">${RATIOS.map((r2) => `<option value="${r2.id}">${r2.label}</option>`).join("")}</select>
          </label>
          <label>default subject
            <select class="sr-d-mode">${SUBJECT_MODES.map((m2) => `<option value="${m2.id}">${m2.label}</option>`).join("")}</select>
          </label>
          <label>sample rate
            <select class="sr-d-stride">
              <option value="2">2 fps (fast)</option>
              <option value="4">4 fps (default)</option>
              <option value="8">8 fps (precise)</option>
            </select>
          </label>
        </div>
        <style>
          .sr-settings { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); display: grid; gap: 8px; }
          .sr-settings label { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: var(--color-fg); }
          .sr-settings select { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
        </style>
      `;
      const r = root.querySelector(".sr-d-ratio");
      const m = root.querySelector(".sr-d-mode");
      const s = root.querySelector(".sr-d-stride");
      r.value = defaults.ratioId;
      m.value = defaults.subjectMode;
      s.value = String(defaults.sampleStrideHz);
      const save = async () => {
        defaults = {
          ...defaults,
          ratioId: r.value,
          subjectMode: m.value,
          sampleStrideHz: parseInt(s.value, 10)
        };
        await wb.storage.set("defaults", defaults);
      };
      r.addEventListener("change", save);
      m.addEventListener("change", save);
      s.addEventListener("change", save);
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "reframe_clip",
      description: "Subject-aware reframe of a video clip to a target aspect ratio. Returns a status object \u2014 the actual solve runs in the panel for visibility.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number" },
          clip_duration: { type: "number" },
          target_ratio: { type: "string", enum: RATIOS.map((r) => r.id) },
          subject: { type: "string", enum: SUBJECT_MODES.map((m) => m.id) }
        },
        required: ["clip_start", "clip_duration", "target_ratio"]
      }
    },
    async invoke({ clip_start, clip_duration, target_ratio, subject }) {
      return JSON.stringify({
        ok: false,
        message: "Open the Reframe panel and click Solve. Headless solving requires user-visible progress (12 MB model download on first use).",
        clip: { start: clip_start, duration: clip_duration },
        ratio: target_ratio,
        subject: subject ?? defaults.subjectMode
      });
    }
  });
  wb.log(`smart-reframe activated`);
  async function runSolve() {
    if (!activeClip) {
      panel?.setStatus("no clip selected", true);
      return;
    }
    panel?.setBusy(true);
    panel?.setStatus("loading clip\u2026");
    try {
      const html = await wb.composition.read();
      const src = pickClipSrc(html, activeClip);
      if (!src) throw new Error("clip src not found");
      panel?.setStatus("sampling frames\u2026");
      const frames = await sampleFrames(src, activeClip.duration, defaults.sampleStrideHz);
      panel?.renderThumbs(frames);
      const fw = frames[0]?.width ?? 1280;
      const fh = frames[0]?.height ?? 720;
      panel?.setSize(fw, fh);
      panel?.setStatus(`detecting (${frames.length} frames)\u2026`);
      const detsByFrame = [];
      const subjectMode = SUBJECT_MODES.find((m) => m.id === activeMode);
      const wantClasses = subjectMode?.id === "face" ? ["person"] : subjectMode?.classes ?? null;
      for (let i = 0; i < frames.length; i++) {
        panel?.setStatus(`detecting ${i + 1}/${frames.length}\u2026`);
        const dets = await detectBitmap(frames[i].bitmap, {
          threshold: defaults.minConf,
          onProgress: (loaded, total) => {
            panel?.setStatus(`downloading model ${(loaded / total * 100).toFixed(0)}%`);
          }
        });
        detsByFrame.push({ t: frames[i].t, dets: classFilter(dets, wantClasses) });
      }
      panel?.setStatus("solving path\u2026");
      const ratio = findRatio(activeRatioId);
      const associated = associate(detsByFrame, fw, fh);
      const keyframes = solvePath(associated, fw, fh, ratio, activeClip.duration, defaults);
      panel?.renderPath(associated, ratio, fw, fh);
      const id = await clipIdOf(src, activeClip.start, activeClip.duration);
      await wb.storage.set(`paths.${id}`, {
        ratioId: activeRatioId,
        subjectMode: activeMode,
        keyframes,
        durationS: activeClip.duration,
        frameW: fw,
        frameH: fh,
        solvedAt: Date.now()
      });
      const matcher = makeClipMatcher({ start: activeClip.start, duration: activeClip.duration });
      const next = tagVideo(html, matcher, id);
      await wb.composition.write(next, "smart-reframe: tag clip");
      await wb.composition.repaint();
      panel?.setStatus(`solved \u2014 ${keyframes.length} keyframes, ${frames.length} samples`);
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), true);
      wb.log(`smart-reframe error: ${e?.message ?? e}`);
    } finally {
      panel?.setBusy(false);
    }
  }
}
function pickClipSrc(html, clip) {
  const re = /<video\b([^>]*)>/gi;
  let m;
  while (m = re.exec(html)) {
    const attrs = m[1];
    const start = parseFloat(attrMatch(attrs, "data-start"));
    const dur = parseFloat(attrMatch(attrs, "data-duration"));
    if (Math.abs(start - clip.start) < 0.01 && Math.abs(dur - clip.duration) < 0.01) {
      return attrMatch(attrs, "src");
    }
  }
  return null;
}
function attrMatch(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}
function uniqueClipIds(html) {
  const re = /data-smart-reframe="([^"]+)"/gi;
  const out = /* @__PURE__ */ new Set();
  let m;
  while (m = re.exec(html)) out.add(m[1]);
  return [...out];
}
export {
  manifest,
  onActivate
};
