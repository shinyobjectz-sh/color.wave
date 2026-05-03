// src/presets.js
var PRESETS = [
  {
    id: "punchy",
    label: "Punchy",
    description: "Tight cuts, hard transitions. For high-energy promo / shorts.",
    p1: { x: 0.05, y: 0.05 },
    p2: { x: 0.95, y: 0.95 },
    attackMaxMs: 80,
    decayMaxMs: 80,
    crossfadeMaxMs: 30
  },
  {
    id: "natural",
    label: "Natural",
    description: "Hold a beat of breath at each cut. The default.",
    p1: { x: 0.25, y: 0.2 },
    p2: { x: 0.75, y: 0.8 },
    attackMaxMs: 180,
    decayMaxMs: 180,
    crossfadeMaxMs: 80
  },
  {
    id: "podcast",
    label: "Podcast",
    description: "Generous pads + soft crossfades. Conversational tone.",
    p1: { x: 0.4, y: 0.35 },
    p2: { x: 0.6, y: 0.65 },
    attackMaxMs: 280,
    decayMaxMs: 280,
    crossfadeMaxMs: 140
  },
  {
    id: "asmr",
    label: "ASMR",
    description: "Maximum room tone preserved. Long crossfades, no pops.",
    p1: { x: 0.55, y: 0.6 },
    p2: { x: 0.45, y: 0.4 },
    attackMaxMs: 400,
    decayMaxMs: 400,
    crossfadeMaxMs: 220
  }
];
function findPreset(id) {
  return PRESETS.find((p) => p.id === id) ?? null;
}
var DEFAULT_PRESET_ID = "natural";

// src/waveform.js
function mountWaveform(canvas) {
  const ctx = canvas.getContext("2d");
  let buffer = null;
  let sampleRate = 16e3;
  let silences = [];
  let cuts = [];
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
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!buffer) return;
    const totalS = buffer.length / sampleRate;
    ctx.fillStyle = "rgba(255, 64, 64, 0.18)";
    for (const s of silences) {
      const x0 = s.t_start / totalS * w;
      const x1 = s.t_end / totalS * w;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }
    ctx.fillStyle = "rgb(180, 200, 220)";
    const samplesPerPx = Math.max(1, Math.floor(buffer.length / w));
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPx;
      const end = Math.min(buffer.length, start + samplesPerPx);
      let lo = 0, hi = 0;
      for (let i = start; i < end; i++) {
        const v = buffer[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const y0 = mid - hi * mid;
      const y1 = mid - lo * mid;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    ctx.fillStyle = "rgba(255, 32, 32, 0.55)";
    for (const c of cuts) {
      const x0 = c.drop[0] / totalS * w;
      const x1 = c.drop[1] / totalS * w;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }
  }
  return {
    setBuffer(buf, rate) {
      buffer = buf;
      sampleRate = rate;
      draw();
    },
    setSilences(s) {
      silences = s;
      draw();
    },
    setCuts(c) {
      cuts = c;
      draw();
    },
    destroy() {
      ro.disconnect();
    }
  };
}

// src/bezier.js
var HANDLE_R = 7;
function mountBezier(canvas, initial, onChange) {
  const ctx = canvas.getContext("2d");
  let p1 = { ...initial.p1 };
  let p2 = { ...initial.p2 };
  let drag = null;
  const dpr = window.devicePixelRatio || 1;
  function size() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }
  size();
  window.addEventListener("resize", size);
  function w() {
    return canvas.width;
  }
  function h() {
    return canvas.height;
  }
  function toPx(p) {
    return [p.x * w(), (1 - p.y) * h()];
  }
  function toNorm(px, py) {
    return {
      x: clamp01(px / w()),
      y: clamp01(1 - py / h())
    };
  }
  function draw() {
    ctx.clearRect(0, 0, w(), h());
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1 * dpr;
    for (let i = 1; i < 4; i++) {
      const x = i / 4 * w();
      const y = i / 4 * h();
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h());
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w(), y);
      ctx.stroke();
    }
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, h());
    ctx.lineTo(p1x, p1y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w(), 0);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgb(0, 220, 255)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, h());
    ctx.bezierCurveTo(p1x, p1y, p2x, p2y, w(), 0);
    ctx.stroke();
    drawPoint(p1x, p1y, drag === "p1");
    drawPoint(p2x, p2y, drag === "p2");
  }
  function drawPoint(x, y, active) {
    ctx.fillStyle = active ? "rgb(0, 220, 255)" : "rgb(255,255,255)";
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  function pickHandle(px, py) {
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    const r = HANDLE_R * dpr * 1.8;
    if (dist(px, py, p1x, p1y) < r) return "p1";
    if (dist(px, py, p2x, p2y) < r) return "p2";
    return null;
  }
  function localPx(ev) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr];
  }
  function onDown(ev) {
    const [px, py] = localPx(ev);
    drag = pickHandle(px, py);
    if (drag) ev.preventDefault();
    draw();
  }
  function onMove(ev) {
    if (!drag) return;
    const [px, py] = localPx(ev);
    const n = toNorm(px, py);
    if (drag === "p1") p1 = n;
    else p2 = n;
    onChange?.({ p1, p2 });
    draw();
  }
  function onUp() {
    if (!drag) return;
    drag = null;
    draw();
  }
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  draw();
  return {
    set(curve) {
      p1 = { ...curve.p1 };
      p2 = { ...curve.p2 };
      draw();
    },
    get() {
      return { p1: { ...p1 }, p2: { ...p2 } };
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", size);
    }
  };
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// src/policy.js
var MIN_SILENCE_MS_DEFAULT = 250;
var MIN_KEEP_MS_DEFAULT = 120;
function findSilences(words, opts = {}) {
  const minSilenceMs = opts.minSilenceMs ?? MIN_SILENCE_MS_DEFAULT;
  const silences = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    const gapMs = (b.t_start - a.t_end) * 1e3;
    if (gapMs >= minSilenceMs) {
      silences.push({
        t_start: a.t_end,
        t_end: b.t_start,
        durMs: gapMs,
        leadingWord: a.word,
        trailingWord: b.word
      });
    }
  }
  return silences;
}
function computeCuts(words, curve, opts = {}) {
  const minKeepMs = opts.minKeepMs ?? MIN_KEEP_MS_DEFAULT;
  const silences = findSilences(words, opts);
  const depth = Math.max(curve.p1.y, 1 - curve.p2.y);
  const cuts = [];
  for (const s of silences) {
    const dMs = s.durMs;
    const attackPadMs = curve.p1.x * Math.min(dMs / 2, curve.attackMaxMs);
    const decayPadMs = (1 - curve.p2.x) * Math.min(dMs / 2, curve.decayMaxMs);
    const crossfadeMs = depth * Math.min(dMs, curve.crossfadeMaxMs);
    const dropStart = s.t_start + attackPadMs / 1e3;
    const dropEnd = s.t_end - decayPadMs / 1e3;
    const dropMs = (dropEnd - dropStart) * 1e3;
    if (dropMs < minKeepMs) continue;
    cuts.push({
      drop: [round3(dropStart), round3(dropEnd)],
      crossfadeMs: Math.round(crossfadeMs)
    });
  }
  return cuts;
}
function totalKeptDuration(originalDurationS, cuts) {
  let droppedS = 0;
  for (const c of cuts) droppedS += c.drop[1] - c.drop[0];
  return Math.max(0, originalDurationS - droppedS);
}
function round3(x) {
  return Math.round(x * 1e3) / 1e3;
}

// src/panel.js
function mountPanel(root, deps) {
  const { wb, runTighten, getActiveCurve, setActiveCurve, getActivePresetId, setActivePresetId } = deps;
  root.innerHTML = `
    <div class="sc-wrap">
      <header class="sc-head">
        <div class="sc-title">silence-cutter</div>
        <div class="sc-meta">
          <span class="sc-state-label">clip</span>
          <span class="sc-clip-name">\u2014 pick a clip from the timeline \u2014</span>
        </div>
      </header>

      <div class="sc-section">
        <canvas class="sc-waveform" aria-label="audio waveform"></canvas>
      </div>

      <div class="sc-row">
        <div class="sc-curve-col">
          <div class="sc-section-label">curve</div>
          <canvas class="sc-bezier" aria-label="bezier curve editor"></canvas>
          <div class="sc-presets"></div>
        </div>
        <div class="sc-stats-col">
          <div class="sc-section-label">stats</div>
          <dl class="sc-stats">
            <dt>silences</dt><dd class="sc-stat-silences">\u2014</dd>
            <dt>cuts</dt><dd class="sc-stat-cuts">\u2014</dd>
            <dt>original</dt><dd class="sc-stat-orig">\u2014</dd>
            <dt>tightened</dt><dd class="sc-stat-out">\u2014</dd>
            <dt>saved</dt><dd class="sc-stat-saved">\u2014</dd>
          </dl>
          <button class="sc-tighten" disabled>Tighten</button>
          <div class="sc-status"></div>
        </div>
      </div>
    </div>
    <style>
      .sc-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .sc-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
      .sc-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .sc-meta { display: flex; gap: 6px; align-items: baseline; }
      .sc-state-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .sc-clip-name { color: var(--color-fg); }
      .sc-section { margin-bottom: 10px; }
      .sc-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .sc-waveform { width: 100%; height: 80px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; }
      .sc-row { display: grid; grid-template-columns: 1fr 180px; gap: 10px; }
      .sc-bezier { width: 100%; height: 160px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; cursor: crosshair; touch-action: none; }
      .sc-presets { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .sc-preset { background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; padding: 4px 8px; font-size: 10px; color: var(--color-fg-muted); cursor: pointer; }
      .sc-preset:hover { border-color: var(--color-fg-muted); }
      .sc-preset.active { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 10%, var(--color-page)); }
      .sc-stats { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 11px; margin: 0; }
      .sc-stats dt { color: var(--color-fg-faint); }
      .sc-stats dd { margin: 0; color: var(--color-fg); font-variant-numeric: tabular-nums; }
      .sc-tighten { margin-top: 10px; width: 100%; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .sc-tighten:disabled { opacity: 0.4; cursor: not-allowed; }
      .sc-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .sc-status.err { color: rgb(255, 120, 120); }
    </style>
  `;
  const waveCanvas = root.querySelector(".sc-waveform");
  const bezierCanvas = root.querySelector(".sc-bezier");
  const presetsEl = root.querySelector(".sc-presets");
  const tightenBtn = root.querySelector(".sc-tighten");
  const statusEl = root.querySelector(".sc-status");
  const clipNameEl = root.querySelector(".sc-clip-name");
  const stat = {
    silences: root.querySelector(".sc-stat-silences"),
    cuts: root.querySelector(".sc-stat-cuts"),
    orig: root.querySelector(".sc-stat-orig"),
    out: root.querySelector(".sc-stat-out"),
    saved: root.querySelector(".sc-stat-saved")
  };
  const wave = mountWaveform(waveCanvas);
  let curve = getActiveCurve();
  let activePresetId = getActivePresetId();
  let words = null;
  let cuts = [];
  let originalDur = 0;
  let busy = false;
  const bezier = mountBezier(bezierCanvas, curve, ({ p1, p2 }) => {
    curve = { ...curve, p1, p2 };
    setActiveCurve(curve);
    activePresetId = null;
    setActivePresetId(null);
    refreshPresetUI();
    recomputeCuts();
  });
  function refreshPresetUI() {
    presetsEl.innerHTML = "";
    for (const p of PRESETS) {
      const b = document.createElement("button");
      b.className = "sc-preset";
      if (p.id === activePresetId) b.classList.add("active");
      b.textContent = p.label;
      b.title = p.description;
      b.addEventListener("click", () => {
        activePresetId = p.id;
        setActivePresetId(p.id);
        curve = {
          p1: { ...p.p1 },
          p2: { ...p.p2 },
          attackMaxMs: p.attackMaxMs,
          decayMaxMs: p.decayMaxMs,
          crossfadeMaxMs: p.crossfadeMaxMs
        };
        setActiveCurve(curve);
        bezier.set(curve);
        refreshPresetUI();
        recomputeCuts();
      });
      presetsEl.appendChild(b);
    }
  }
  function recomputeCuts() {
    if (!words) return;
    cuts = computeCuts(words, curve);
    const silences = findSilences(words);
    wave.setSilences(silences);
    wave.setCuts(cuts);
    const tightened = totalKeptDuration(originalDur, cuts);
    stat.silences.textContent = String(silences.length);
    stat.cuts.textContent = String(cuts.length);
    stat.orig.textContent = fmtSec(originalDur);
    stat.out.textContent = fmtSec(tightened);
    stat.saved.textContent = fmtSec(originalDur - tightened);
    tightenBtn.disabled = busy || cuts.length === 0;
  }
  function setStatus(msg, isErr = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!isErr);
  }
  function setBusy(b) {
    busy = b;
    tightenBtn.disabled = b || cuts.length === 0;
  }
  tightenBtn.addEventListener("click", async () => {
    if (busy || !cuts.length) return;
    setBusy(true);
    setStatus("applying cuts\u2026");
    try {
      await runTighten(cuts);
      setStatus(`tightened \u2014 dropped ${cuts.length} silences`);
    } catch (e) {
      setStatus(String(e?.message ?? e), true);
    } finally {
      setBusy(false);
    }
  });
  refreshPresetUI();
  return {
    setClip(clip) {
      clipNameEl.textContent = clip?.label ?? "(untitled clip)";
    },
    setAudio(buffer, sampleRate, durationS) {
      originalDur = durationS;
      wave.setBuffer(buffer, sampleRate);
      stat.orig.textContent = fmtSec(durationS);
    },
    setWords(w) {
      words = w;
      recomputeCuts();
    },
    setStatus,
    setBusy,
    destroy() {
      wave.destroy();
      bezier.destroy();
      root.innerHTML = "";
    }
  };
}
function fmtSec(s) {
  if (!isFinite(s)) return "\u2014";
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(2);
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

// src/decode.js
var TARGET_RATE = 16e3;
async function decodeToMono16k(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try {
    decoded = await ac.decodeAudioData(arrayBuf.slice(0));
  } finally {
    ac.close().catch(() => {
    });
  }
  const ch0 = decoded.getChannelData(0);
  const monoMix = decoded.numberOfChannels > 1 ? mixToMono(decoded) : ch0;
  return resampleLinear(monoMix, decoded.sampleRate, TARGET_RATE);
}
function mixToMono(buf) {
  const n = buf.length;
  const out = new Float32Array(n);
  const chs = buf.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  for (let i = 0; i < n; i++) out[i] /= chs;
  return out;
}
function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}
function pcmToWav(pcm, sampleRate = TARGET_RATE) {
  const numSamples = pcm.length;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
function writeStr(view, offset, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}
var SAMPLE_RATE = TARGET_RATE;

// src/whisper-cloud.js
var ENDPOINT = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
async function transcribe(audioBlob, opts = {}) {
  const token = opts.token ?? null;
  const headers = {
    "Content-Type": audioBlob.type || "audio/wav",
    "Accept": "application/json"
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const body = JSON.stringify({
    parameters: { return_timestamps: "word" }
  });
  const init = {
    method: "POST",
    headers,
    body: audioBlob
  };
  let resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  if (resp.status === 503) {
    const detail = await resp.json().catch(() => ({}));
    const eta = Math.min(30, Math.ceil(detail.estimated_time ?? 6));
    await sleep(eta * 1e3);
    resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`whisper cloud ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return normalize(data);
}
function normalize(data) {
  const chunks = data.chunks ?? data.words ?? [];
  return chunks.map((c) => {
    const ts = c.timestamp ?? c.timestamps ?? null;
    if (!ts) return null;
    return {
      word: (c.text ?? c.word ?? "").trim(),
      t_start: ts[0],
      t_end: ts[1]
    };
  }).filter(Boolean);
}
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// src/apply.js
function applyCutsToClip(html, clipMatcher, cuts) {
  const json = JSON.stringify(
    cuts.map((c) => ({ drop: c.drop, xfade: c.crossfadeMs ?? 0 }))
  );
  const tagRe = /<(video|audio)\b([^>]*)>/gi;
  let mutated = false;
  const out = html.replace(tagRe, (full, tag, attrs) => {
    if (mutated) return full;
    if (!clipMatcher(attrs)) return full;
    mutated = true;
    const cleaned = attrs.replace(/\sdata-cuts="[^"]*"/, "");
    return `<${tag}${cleaned} data-cuts='${escapeAttr(json)}'>`;
  });
  if (!mutated) {
    throw new Error("silence-cutter: no clip matched for cuts apply");
  }
  return out;
}
function makeClipMatcher({ start, duration }) {
  return (attrs) => {
    const s = pickAttr(attrs, "data-start");
    const d = pickAttr(attrs, "data-duration");
    if (s == null || d == null) return false;
    return approxEq(parseFloat(s), start) && approxEq(parseFloat(d), duration);
  };
}
function pickAttr(attrs, name) {
  const re = new RegExp(`\\s${name}="([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? m[1] : null;
}
function approxEq(a, b, eps = 0.01) {
  return Math.abs(a - b) < eps;
}
function escapeAttr(s) {
  return String(s).replace(/'/g, "&#39;");
}
var RUNTIME_SHIM = `
(function(){
  const SHIM_KEY = "__cwSilenceCutterShim";
  if (window[SHIM_KEY]) return;
  window[SHIM_KEY] = true;
  function init(el){
    let cuts;
    try { cuts = JSON.parse(el.getAttribute("data-cuts") || "[]"); }
    catch(e){ console.warn("silence-cutter: bad data-cuts", e); return; }
    if (!cuts.length) return;
    cuts.sort((a,b)=>a.drop[0]-b.drop[0]);
    let ctx, gain, src;
    function ensureGraph(){
      if (gain) return;
      try {
        ctx = new (window.AudioContext||window.webkitAudioContext)();
        src = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        src.connect(gain).connect(ctx.destination);
      } catch(e){ /* MediaElementSource can only be created once per el */ }
    }
    el.addEventListener("timeupdate", () => {
      const t = el.currentTime;
      for (const c of cuts) {
        const [t0, t1] = c.drop;
        if (t >= t0 && t < t1) {
          ensureGraph();
          if (gain && c.xfade > 0) {
            const now = ctx.currentTime;
            const xs = c.xfade/1000;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + xs/2);
            gain.gain.linearRampToValueAtTime(1, now + xs);
          }
          el.currentTime = t1;
          return;
        }
      }
    });
  }
  function scan(){
    document.querySelectorAll("video[data-cuts],audio[data-cuts]").forEach(init);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else { scan(); }
})();
`;

// src/index.js
var manifest = {
  id: "silence-cutter",
  name: "Silence Cutter",
  version: "0.1.0",
  description: "Whisper-aware silence removal. One bezier curve replaces twelve Premiere sliders.",
  icon: "\u2702\uFE0F",
  surfaces: ["panel-tabs", "timeline-clip-actions", "settings", "agent-tools", "composition-decorators"],
  permissions: [
    "network:api-inference.huggingface.co",
    "storage:indexeddb"
  ]
};
var DEFAULT_CURVE = (() => {
  const p = findPreset(DEFAULT_PRESET_ID);
  return {
    p1: { ...p.p1 },
    p2: { ...p.p2 },
    attackMaxMs: p.attackMaxMs,
    decayMaxMs: p.decayMaxMs,
    crossfadeMaxMs: p.crossfadeMaxMs
  };
})();
async function onActivate(wb) {
  let curve = wb.storage.get("curve") ?? DEFAULT_CURVE;
  let activePresetId = wb.storage.get("preset") ?? DEFAULT_PRESET_ID;
  let hfToken = wb.storage.get("hfToken") ?? "";
  let activeClip = null;
  let activeAudio = null;
  let activeWords = null;
  let panelInstance = null;
  wb.composition.addRenderDecorator({
    priority: 50,
    transform(html) {
      if (!html.includes("data-cuts=")) return html;
      return html + `
<script data-silence-cutter>${RUNTIME_SHIM}<\/script>`;
    }
  });
  wb.panels.addTab({
    id: "silence-cutter",
    label: "Cuts",
    icon: "\u2702\uFE0F",
    component: null,
    // no Svelte build; using mount fallback below
    mount(root) {
      panelInstance = mountPanel(root, {
        wb,
        getActiveCurve: () => curve,
        setActiveCurve: (c) => {
          curve = c;
          wb.storage.set("curve", c);
        },
        getActivePresetId: () => activePresetId,
        setActivePresetId: (id) => {
          activePresetId = id;
          wb.storage.set("preset", id);
        },
        async runTighten(cuts) {
          if (!activeClip) throw new Error("no clip selected");
          const html = await wb.composition.read();
          const matcher = makeClipMatcher({
            start: activeClip.start,
            duration: activeClip.duration
          });
          const next = applyCutsToClip(html, matcher, cuts);
          await wb.composition.write(next, "silence-cutter: tighten clip");
          await wb.composition.repaint();
        }
      });
      if (activeClip) panelInstance.setClip(activeClip);
      if (activeAudio) {
        panelInstance.setAudio(activeAudio.buffer, activeAudio.sampleRate, activeAudio.durationS);
      }
      if (activeWords) panelInstance.setWords(activeWords);
      return () => {
        panelInstance?.destroy();
        panelInstance = null;
      };
    }
  });
  wb.timeline.addClipAction({
    icon: "\u2702",
    label: "Find silences",
    when: (clip) => clip && (clip.tagName === "video" || clip.tagName === "audio"),
    async onClick(clip) {
      activeClip = clip;
      activeWords = null;
      try {
        const html = await wb.composition.read();
        const src = pickClipSrc(html, clip);
        if (!src) throw new Error("clip src not found in composition");
        const blob = await fetchClipAudio(src);
        const pcm = await decodeToMono16k(blob);
        activeAudio = {
          buffer: pcm,
          sampleRate: SAMPLE_RATE,
          durationS: pcm.length / SAMPLE_RATE,
          blob
        };
        panelInstance?.setClip(clip);
        panelInstance?.setAudio(pcm, SAMPLE_RATE, activeAudio.durationS);
        panelInstance?.setStatus("transcribing\u2026");
        const wav = pcmToWav(pcm);
        const words = await transcribe(wav, { token: hfToken || null });
        activeWords = words;
        panelInstance?.setWords(words);
        panelInstance?.setStatus(`${words.length} words detected`);
      } catch (e) {
        panelInstance?.setStatus(String(e?.message ?? e), true);
        wb.log(`silence-cutter error: ${e?.message ?? e}`);
      }
    }
  });
  wb.settings.addSection({
    label: "Silence Cutter",
    mount(root) {
      root.innerHTML = `
        <div class="sc-settings">
          <label>HuggingFace token (optional, raises rate limit)
            <input type="password" class="sc-token" placeholder="hf_\u2026" />
          </label>
          <p class="sc-hint">Stored in this workbook only. Anonymous calls are rate-limited to ~10/min.</p>
        </div>
        <style>
          .sc-settings { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); }
          .sc-settings label { display: block; color: var(--color-fg); }
          .sc-token { width: 100%; margin-top: 4px; padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
          .sc-hint { font-size: 10px; margin: 6px 0 0; }
        </style>
      `;
      const input = root.querySelector(".sc-token");
      input.value = hfToken;
      input.addEventListener("change", async () => {
        hfToken = input.value.trim();
        await wb.storage.set("hfToken", hfToken);
      });
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "tighten_clip",
      description: "Remove silences from a clip in the composition. Returns the proposed cut list as JSON; the user must approve in the panel before mutation.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number", description: "data-start of the target clip (seconds)" },
          clip_duration: { type: "number", description: "data-duration of the target clip (seconds)" },
          preset: { type: "string", enum: PRESETS.map((p) => p.id), description: "Bezier preset; defaults to 'natural'." }
        },
        required: ["clip_start", "clip_duration"]
      }
    },
    async invoke({ clip_start, clip_duration, preset }) {
      const presetDef = preset ? findPreset(preset) : findPreset(DEFAULT_PRESET_ID);
      if (!presetDef) throw new Error(`unknown preset: ${preset}`);
      const c = {
        p1: { ...presetDef.p1 },
        p2: { ...presetDef.p2 },
        attackMaxMs: presetDef.attackMaxMs,
        decayMaxMs: presetDef.decayMaxMs,
        crossfadeMaxMs: presetDef.crossfadeMaxMs
      };
      return JSON.stringify({
        ok: false,
        message: "Open the timeline, right-click the clip \u2192 Find silences. The agent can't yet run transcription headlessly; the panel will show the proposed cuts so you can approve.",
        clip: { start: clip_start, duration: clip_duration },
        preset: presetDef.id,
        curve: c
      });
    }
  });
  wb.log(`silence-cutter activated (preset=${activePresetId})`);
}
function pickClipSrc(html, clip) {
  const re = /<(video|audio)\b([^>]*)>/gi;
  let m;
  while (m = re.exec(html)) {
    const attrs = m[2];
    const start = parseFloat(attrMatch(attrs, "data-start"));
    const dur = parseFloat(attrMatch(attrs, "data-duration"));
    if (Math.abs(start - clip.start) < 0.01 && Math.abs(dur - clip.duration) < 0.01) {
      return attrMatch(attrs, "src");
    }
  }
  return null;
}
function attrMatch(attrs, name) {
  const re = new RegExp(`\\s${name}="([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? m[1] : "";
}
async function fetchClipAudio(src) {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`fetch clip ${resp.status}`);
  return await resp.blob();
}
export {
  manifest,
  onActivate
};
