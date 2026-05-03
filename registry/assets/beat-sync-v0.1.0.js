// src/detect/flux.js
var HOP = 512;
var FFT = 1024;
function detectOnsets(pcm, sampleRate) {
  const onsets = [];
  const window2 = hann(FFT);
  let prev = null;
  const fluxes = [];
  for (let off = 0; off + FFT <= pcm.length; off += HOP) {
    const re = new Float32Array(FFT);
    const im = new Float32Array(FFT);
    for (let i = 0; i < FFT; i++) re[i] = pcm[off + i] * window2[i];
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
  const winSize = 25;
  for (let i = 1; i < fluxes.length - 1; i++) {
    const lo = Math.max(0, i - winSize);
    const hi = Math.min(fluxes.length, i + winSize);
    const slice = fluxes.slice(lo, hi).slice().sort((a, b) => a - b);
    const med = slice[Math.floor(slice.length / 2)] || 0;
    const thr = med * 1.4 + 1e-3;
    if (fluxes[i] > thr && fluxes[i] > fluxes[i - 1] && fluxes[i] >= fluxes[i + 1]) {
      onsets.push({ t: i * HOP / sampleRate, flux: fluxes[i] });
    }
  }
  return { onsets, fluxes, fps: sampleRate / HOP };
}
function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}
function fft(re, im) {
  const n = re.length;
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

// src/detect/tempo.js
var MIN_BPM = 70;
var MAX_BPM = 200;
function estimateBeats(fluxes, fps) {
  const bpm = autocorrBPM(fluxes, fps);
  const beatPeriodS = 60 / bpm;
  const totalS = fluxes.length / fps;
  const offsets = 32;
  let bestPhase = 0;
  let bestScore = -Infinity;
  for (let p = 0; p < offsets; p++) {
    const phase = p / offsets * beatPeriodS;
    let score = 0;
    for (let t = phase; t < totalS; t += beatPeriodS) {
      const idx = Math.round(t * fps);
      if (idx >= 0 && idx < fluxes.length) score += fluxes[idx];
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  const beats = [];
  for (let t = bestPhase, i = 0; t < totalS; t += beatPeriodS, i++) {
    const idx = Math.round(t * fps);
    const conf = idx >= 0 && idx < fluxes.length ? Math.min(1, fluxes[idx] / (avg(fluxes) * 4 + 1e-6)) : 0;
    beats.push({ t: round3(t), conf: round3(conf), downbeat: i % 4 === 0 });
  }
  return { bpm: round1(bpm), beats };
}
function autocorrBPM(fluxes, fps) {
  const minLag = Math.floor(60 / MAX_BPM * fps);
  const maxLag = Math.ceil(60 / MIN_BPM * fps);
  let best = 0, bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < fluxes.length; i++) sum += fluxes[i] * fluxes[i - lag];
    if (sum > bestVal) {
      bestVal = sum;
      best = lag;
    }
  }
  const halfLag = Math.round(best / 2);
  if (halfLag >= minLag) {
    let sum2 = 0;
    for (let i = halfLag; i < fluxes.length; i++) sum2 += fluxes[i] * fluxes[i - halfLag];
    if (sum2 > bestVal * 0.85 && 60 * fps / best < 100) best = halfLag;
  }
  return 60 * fps / best;
}
function avg(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / Math.max(1, arr.length);
}
function round3(x) {
  return Math.round(x * 1e3) / 1e3;
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

// src/snap.js
function snapClipsToBeats(html, beats, tolMs = 60) {
  if (!beats.length) return { html, snapped: [] };
  const sorted = beats.slice().sort((a, b) => a.t - b.t);
  const tolS = tolMs / 1e3;
  const snapped = [];
  const next = html.replace(/<([a-z][a-z0-9]*)\b([^>]*\sdata-start=)"([^"]+)"([^>]*)>/gi, (full, tag, pre, startStr, post) => {
    const start = parseFloat(startStr);
    if (!Number.isFinite(start)) return full;
    const beat = nearestBeat(sorted, start);
    if (!beat) return full;
    if (Math.abs(beat.t - start) > tolS) return full;
    snapped.push({ from: start, to: beat.t });
    return `<${tag}${pre}"${beat.t.toFixed(3)}"${post}>`;
  });
  return { html: next, snapped };
}
function nearestBeat(sorted, t) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (sorted[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const cands = [];
  if (lo > 0) cands.push(sorted[lo - 1]);
  if (lo < sorted.length) cands.push(sorted[lo]);
  if (!cands.length) return null;
  return cands.reduce((a, b) => Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b);
}

// src/decorator.js
function decorate(html, state) {
  if (!state || !state.enabled || !state.beats?.length) return html;
  const beatJson = JSON.stringify(state.beats.map((b) => ({ t: b.t, d: b.downbeat ? 1 : 0 })));
  const hitMs = state.hitMs ?? 120;
  const css = effectCss(state.effect ?? "flash");
  const shim = runtimeShim();
  return html + `
<style data-beat-sync>
:root { --cw-beat-flash: 0; }
${css}
@keyframes cw-beat-flash { 0% { --cw-beat-flash: 1; } 100% { --cw-beat-flash: 0; } }
</style>
<script type="module" data-beat-sync>
const BEATS = ${beatJson};
const HIT_MS = ${hitMs};
const SCOPE = ${JSON.stringify(state.scope ?? "global")};
${shim}
<\/script>
`;
}
function effectCss(effect) {
  switch (effect) {
    case "zoom":
      return `
[data-beat-hit="1"] { animation: cw-beat-zoom var(--cw-beat-dur, 120ms) ease-out; }
@keyframes cw-beat-zoom { 0% { transform: scale(1.06); } 100% { transform: scale(1); } }
`;
    case "shake":
      return `
[data-beat-hit="1"] { animation: cw-beat-shake var(--cw-beat-dur, 120ms) ease-in-out; }
@keyframes cw-beat-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
`;
    case "none":
      return ``;
    case "flash":
    default:
      return `
[data-beat-hit="1"] { animation: cw-beat-flash-bg var(--cw-beat-dur, 120ms) ease-out; }
@keyframes cw-beat-flash-bg { 0% { filter: brightness(1.5); } 100% { filter: brightness(1); } }
`;
  }
}
function runtimeShim() {
  return `
const KEY = "__cwBeatSyncBound";
if (window[KEY]) { /* skip duplicate bind */ }
else {
  window[KEY] = true;
  const targets = () => {
    if (SCOPE === "global") return [...document.querySelectorAll("[data-start]"), document.body];
    return [...document.querySelectorAll("[data-beat-hit-target],[data-beat-hit]")];
  };
  let lastBeatIdx = -1;
  function getTime() {
    const v = document.querySelector("video,audio");
    return v ? v.currentTime : (typeof window.cw?.time === "number" ? window.cw.time : 0);
  }
  function tick() {
    const t = getTime();
    let idx = -1;
    for (let i = 0; i < BEATS.length; i++) {
      if (Math.abs(t - BEATS[i].t) < HIT_MS / 2000) { idx = i; break; }
    }
    if (idx >= 0 && idx !== lastBeatIdx) {
      lastBeatIdx = idx;
      document.documentElement.style.setProperty("--cw-beat-flash", "1");
      const beat = BEATS[idx];
      document.dispatchEvent(new CustomEvent("cw:beat", { detail: { t: beat.t, downbeat: !!beat.d } }));
      for (const el of targets()) {
        el.setAttribute("data-beat-hit", "1");
        setTimeout(() => el.setAttribute("data-beat-hit", "0"), HIT_MS);
      }
      setTimeout(() => document.documentElement.style.setProperty("--cw-beat-flash", "0"), HIT_MS);
    }
    requestAnimationFrame(tick);
  }
  tick();
}
`;
}

// src/ui/waveform.js
function mountBeatWaveform(canvas) {
  const ctx = canvas.getContext("2d");
  let pcm = null, sr = 16e3, beats = [];
  const dpr = window.devicePixelRatio || 1;
  function size() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }
  size();
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!pcm) return;
    const totalS = pcm.length / sr;
    ctx.fillStyle = "rgb(180, 200, 220)";
    const samplesPerPx = Math.max(1, Math.floor(pcm.length / w));
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPx;
      const end = Math.min(pcm.length, start + samplesPerPx);
      let lo = 0, hi = 0;
      for (let i = start; i < end; i++) {
        const v = pcm[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const y0 = mid - hi * mid;
      const y1 = mid - lo * mid;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    for (const b of beats) {
      const x = b.t / totalS * w;
      ctx.fillStyle = b.downbeat ? "rgb(0, 220, 255)" : "rgba(0, 220, 255, 0.45)";
      const tickH = b.downbeat ? h : h * 0.5;
      ctx.fillRect(x - 0.5 * dpr, (h - tickH) / 2, 1 * dpr, tickH);
    }
  }
  return {
    setBuffer(buf, rate) {
      pcm = buf;
      sr = rate;
      draw();
    },
    setBeats(b) {
      beats = b;
      draw();
    },
    destroy() {
      ro.disconnect();
    }
  };
}

// src/ui/panel.js
function mountBeatPanel(root, deps) {
  const { onTrackLoad, onDetect, onSnap, onClear, getState, setEffect } = deps;
  root.innerHTML = `
    <div class="bs-wrap">
      <header class="bs-head">
        <div class="bs-title">beat-sync</div>
        <div class="bs-meta">
          <span class="bs-bpm">\u2014 BPM</span>
        </div>
      </header>
      <div class="bs-drop">drop a track to detect beats</div>
      <canvas class="bs-wave" aria-label="track waveform with beat ticks"></canvas>
      <div class="bs-controls">
        <label>tolerance <span class="bs-tol-val">60ms</span>
          <input class="bs-tol" type="range" min="10" max="200" value="60" />
        </label>
        <label>hit effect
          <select class="bs-effect">
            <option value="flash">Flash</option>
            <option value="zoom">Zoom</option>
            <option value="shake">Shake</option>
            <option value="none">None</option>
          </select>
        </label>
      </div>
      <div class="bs-row">
        <button class="bs-detect" disabled>Detect</button>
        <button class="bs-snap" disabled>Snap clips</button>
        <button class="bs-clear" disabled>Clear</button>
      </div>
      <div class="bs-status"></div>
    </div>
    <style>
      .bs-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .bs-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .bs-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .bs-bpm { color: var(--color-fg); font-variant-numeric: tabular-nums; }
      .bs-drop { padding: 16px 8px; border: 1px dashed var(--color-border); border-radius: 6px; text-align: center; cursor: pointer; margin-bottom: 8px; color: var(--color-fg-muted); }
      .bs-drop.over { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 8%, var(--color-page)); }
      .bs-wave { width: 100%; height: 80px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; margin-bottom: 8px; }
      .bs-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .bs-controls label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; display: flex; flex-direction: column; gap: 3px; }
      .bs-controls input, .bs-controls select { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: 11px ui-monospace, monospace; }
      .bs-row { display: flex; gap: 6px; margin-bottom: 6px; }
      .bs-row button { flex: 1; padding: 6px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .bs-detect { background: var(--color-accent) !important; color: var(--color-accent-fg) !important; border-color: var(--color-accent) !important; font-weight: 600 !important; }
      .bs-row button:disabled { opacity: 0.4; cursor: not-allowed; }
      .bs-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .bs-status.err { color: rgb(255, 120, 120); }
    </style>
  `;
  const drop = root.querySelector(".bs-drop");
  const detectBtn = root.querySelector(".bs-detect");
  const snapBtn = root.querySelector(".bs-snap");
  const clearBtn = root.querySelector(".bs-clear");
  const tolInput = root.querySelector(".bs-tol");
  const tolVal = root.querySelector(".bs-tol-val");
  const effectSel = root.querySelector(".bs-effect");
  const statusEl = root.querySelector(".bs-status");
  const bpmEl = root.querySelector(".bs-bpm");
  const waveCanvas = root.querySelector(".bs-wave");
  const wave = mountBeatWaveform(waveCanvas);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("over");
  }));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file?.type.startsWith("audio/")) {
      setStatus("not an audio file", true);
      return;
    }
    await onTrackLoad?.(file);
  });
  drop.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) onTrackLoad?.(f);
    });
    input.click();
  });
  detectBtn.addEventListener("click", () => onDetect?.());
  snapBtn.addEventListener("click", () => onSnap?.(parseInt(tolInput.value, 10)));
  clearBtn.addEventListener("click", () => onClear?.());
  tolInput.addEventListener("input", () => {
    tolVal.textContent = `${tolInput.value}ms`;
  });
  effectSel.addEventListener("change", () => setEffect?.(effectSel.value));
  const s = getState?.();
  if (s?.effect) effectSel.value = s.effect;
  function setStatus(msg, err = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!err);
  }
  return {
    setStatus,
    setBuffer(pcm, rate) {
      wave.setBuffer(pcm, rate);
      detectBtn.disabled = false;
      clearBtn.disabled = false;
    },
    setBeats(beats, bpm) {
      wave.setBeats(beats);
      snapBtn.disabled = !beats.length;
      bpmEl.textContent = bpm ? `${bpm.toFixed(1)} BPM \xB7 ${beats.length} beats` : "\u2014 BPM";
    },
    setBusy(b) {
      detectBtn.disabled = b;
      snapBtn.disabled = b;
      clearBtn.disabled = b;
    },
    destroy() {
      wave.destroy();
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "beat-sync",
  name: "Beat Sync",
  version: "0.1.0",
  description: "Beat-detect a track and snap clip cuts to beats with optional flash/zoom/shake hit effects.",
  icon: "\u266A",
  surfaces: ["panel-tabs", "timeline-clip-actions", "settings", "agent-tools", "composition-decorators"],
  permissions: []
};
var DEFAULT_STATE = {
  enabled: false,
  beats: [],
  bpm: 0,
  effect: "flash",
  hitMs: 120,
  scope: "global",
  trackName: null,
  trackHash: null,
  pcmRate: 16e3
};
async function onActivate(wb) {
  let state = wb.storage.get("state") ?? { ...DEFAULT_STATE };
  let pcm = null;
  let pcmRate = state.pcmRate;
  let panel = null;
  wb.composition.addRenderDecorator({
    priority: 70,
    transform(html) {
      return decorate(html, state);
    }
  });
  wb.panels.addTab({
    id: "beat-sync",
    label: "Beats",
    icon: "\u266A",
    component: null,
    mount(root) {
      panel = mountBeatPanel(root, {
        getState: () => state,
        async onTrackLoad(file) {
          panel?.setStatus("decoding\u2026");
          try {
            const ab = await file.arrayBuffer();
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            let dec;
            try {
              dec = await ac.decodeAudioData(ab.slice(0));
            } finally {
              ac.close().catch(() => {
              });
            }
            const mono = dec.numberOfChannels > 1 ? mixMono(dec) : dec.getChannelData(0);
            pcm = mono;
            pcmRate = dec.sampleRate;
            state = { ...state, trackName: file.name, trackHash: await hashAB(ab), pcmRate };
            await wb.storage.set("state", state);
            panel?.setBuffer(pcm, pcmRate);
            panel?.setStatus(`loaded \xB7 ${dec.duration.toFixed(1)}s @ ${pcmRate}Hz`);
          } catch (e) {
            panel?.setStatus(String(e?.message ?? e), true);
          }
        },
        async onDetect() {
          if (!pcm) {
            panel?.setStatus("no track loaded", true);
            return;
          }
          panel?.setBusy(true);
          panel?.setStatus("detecting\u2026");
          try {
            const { fluxes, fps } = detectOnsets(pcm, pcmRate);
            const { bpm, beats } = estimateBeats(fluxes, fps);
            state = { ...state, beats, bpm, enabled: true };
            await wb.storage.set("state", state);
            panel?.setBeats(beats, bpm);
            panel?.setStatus(`${beats.length} beats @ ${bpm.toFixed(1)} BPM`);
            await wb.composition.repaint();
          } catch (e) {
            panel?.setStatus(String(e?.message ?? e), true);
          } finally {
            panel?.setBusy(false);
          }
        },
        async onSnap(tolMs) {
          if (!state.beats?.length) {
            panel?.setStatus("detect beats first", true);
            return;
          }
          panel?.setBusy(true);
          try {
            const html = await wb.composition.read();
            const { html: next, snapped } = snapClipsToBeats(html, state.beats, tolMs);
            await wb.composition.write(next, `beat-sync: snap ${snapped.length} clips`);
            await wb.composition.repaint();
            panel?.setStatus(`snapped ${snapped.length} clip(s)`);
          } catch (e) {
            panel?.setStatus(String(e?.message ?? e), true);
          } finally {
            panel?.setBusy(false);
          }
        },
        async onClear() {
          state = { ...DEFAULT_STATE };
          pcm = null;
          await wb.storage.set("state", state);
          panel?.setBeats([], 0);
          panel?.setStatus("cleared");
          await wb.composition.repaint();
        },
        async setEffect(effect) {
          state = { ...state, effect };
          await wb.storage.set("state", state);
          await wb.composition.repaint();
        }
      });
      panel.setBeats(state.beats || [], state.bpm || 0);
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.timeline.addClipAction({
    icon: "\u266A",
    label: "Snap to nearest beat",
    when: (clip) => clip && state.beats?.length > 0,
    async onClick(clip) {
      const html = await wb.composition.read();
      const tolS = 0.4;
      const re = new RegExp(`<([a-z][a-z0-9]*)\\b([^>]*\\sdata-start=)"${clip.start.toFixed(3).replace(".", "\\.")}"([^>]*)>`, "i");
      const sorted = state.beats.slice().sort((a, b) => a.t - b.t);
      const nearest = nearestBeat2(sorted, clip.start);
      if (!nearest || Math.abs(nearest.t - clip.start) > tolS) return;
      const next = html.replace(re, (full, tag, pre, post) => `<${tag}${pre}"${nearest.t.toFixed(3)}"${post}>`);
      if (next !== html) {
        await wb.composition.write(next, "beat-sync: snap clip");
        await wb.composition.repaint();
      }
    }
  });
  wb.settings.addSection({
    label: "Beat Sync",
    mount(root) {
      root.innerHTML = `
        <div class="bs-set">
          <label>scope
            <select class="bs-scope">
              <option value="global">All clips + body</option>
              <option value="opt-in">Only [data-beat-hit-target] elements</option>
            </select>
          </label>
          <label>hit duration <span class="bs-hit-val">120ms</span>
            <input class="bs-hit" type="range" min="40" max="300" value="120" />
          </label>
          <p class="bs-hint">Beat-sync emits a <code>cw:beat</code> CustomEvent and a <code>--cw-beat-flash</code> CSS variable so other plugins (letterbox vignette pulse) can react in lockstep.</p>
        </div>
        <style>
          .bs-set { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); display: grid; gap: 8px; }
          .bs-set label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg); }
          .bs-set select, .bs-set input { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
          .bs-hint { font-size: 10px; margin: 4px 0 0; line-height: 1.5; }
        </style>
      `;
      const scope = root.querySelector(".bs-scope");
      const hit = root.querySelector(".bs-hit");
      const hitVal = root.querySelector(".bs-hit-val");
      scope.value = state.scope;
      hit.value = String(state.hitMs);
      hitVal.textContent = `${state.hitMs}ms`;
      scope.addEventListener("change", async () => {
        state = { ...state, scope: scope.value };
        await wb.storage.set("state", state);
        await wb.composition.repaint();
      });
      hit.addEventListener("input", async () => {
        hitVal.textContent = `${hit.value}ms`;
        state = { ...state, hitMs: parseInt(hit.value, 10) };
        await wb.storage.set("state", state);
        await wb.composition.repaint();
      });
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "snap_to_beats",
      description: "Snap clip starts to beats from a previously-loaded track. Fails if no beats are loaded; the user must drop a track + click Detect first.",
      parameters: {
        type: "object",
        properties: {
          tolerance_ms: { type: "number", minimum: 10, maximum: 500 }
        }
      }
    },
    async invoke({ tolerance_ms }) {
      if (!state.beats?.length) {
        return JSON.stringify({ ok: false, message: "No beats detected. Open the Beats panel, drop a track, click Detect." });
      }
      const html = await wb.composition.read();
      const { html: next, snapped } = snapClipsToBeats(html, state.beats, tolerance_ms ?? 60);
      await wb.composition.write(next, `beat-sync: agent snap ${snapped.length}`);
      await wb.composition.repaint();
      return JSON.stringify({ ok: true, snapped: snapped.length, bpm: state.bpm });
    }
  });
  if (state.enabled) {
    queueMicrotask(() => wb.composition.repaint());
  }
  wb.log(`beat-sync activated (beats=${state.beats?.length ?? 0}, bpm=${state.bpm})`);
}
function mixMono(buf) {
  const n = buf.length, ch = buf.numberOfChannels;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  for (let i = 0; i < n; i++) out[i] /= ch;
  return out;
}
async function hashAB(ab) {
  if (!crypto.subtle?.digest) {
    let h = 5381;
    const u8 = new Uint8Array(ab);
    for (let i = 0; i < u8.length; i += 17) h = (h << 5) + h + u8[i] >>> 0;
    return h.toString(16).padStart(8, "0");
  }
  const buf = await crypto.subtle.digest("SHA-256", ab);
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function nearestBeat2(sorted, t) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (sorted[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const cands = [];
  if (lo > 0) cands.push(sorted[lo - 1]);
  if (lo < sorted.length) cands.push(sorted[lo]);
  if (!cands.length) return null;
  return cands.reduce((a, b) => Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b);
}
export {
  manifest,
  onActivate
};
