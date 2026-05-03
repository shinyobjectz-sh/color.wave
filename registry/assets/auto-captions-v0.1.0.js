// src/decode.js
var TARGET_RATE = 16e3;
async function decodeToMono16k(blob) {
  const ab = await blob.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try {
    decoded = await ac.decodeAudioData(ab.slice(0));
  } finally {
    ac.close().catch(() => {
    });
  }
  const mono = decoded.numberOfChannels > 1 ? mixToMono(decoded) : decoded.getChannelData(0);
  return resampleLinear(mono, decoded.sampleRate, TARGET_RATE);
}
function mixToMono(buf) {
  const n = buf.length, ch = buf.numberOfChannels;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  for (let i = 0; i < n; i++) out[i] /= ch;
  return out;
}
function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src), i1 = Math.min(input.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}
function pcmToWav(pcm, sampleRate = TARGET_RATE) {
  const n = pcm.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buffer);
  ws(v, 0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  ws(v, 8, "WAVE");
  ws(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ws(v, 36, "data");
  v.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
function ws(v, o, s) {
  for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
}
var SAMPLE_RATE = TARGET_RATE;

// src/stt/hf.js
var ENDPOINT = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
async function transcribe(wavBlob, opts = {}) {
  const headers = { "Accept": "application/json", "Content-Type": "audio/wav" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const init = { method: "POST", headers, body: wavBlob };
  let resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  if (resp.status === 503) {
    const eta = Math.min(30, Math.ceil((await safeJson(resp)).estimated_time ?? 6));
    await sleep(eta * 1e3);
    resp = await fetch(`${ENDPOINT}?return_timestamps=word`, init);
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`whisper ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const chunks = data.chunks ?? data.words ?? [];
  return chunks.map((c) => {
    const ts = c.timestamp ?? c.timestamps ?? null;
    if (!ts) return null;
    const w = (c.text ?? c.word ?? "").trim();
    if (!w) return null;
    return { t: ts[0], d: Math.max(0.05, (ts[1] ?? ts[0] + 0.2) - ts[0]), w };
  }).filter(Boolean);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function safeJson(r) {
  try {
    return await r.clone().json();
  } catch {
    return {};
  }
}

// src/prosody.js
var FRAME_MS = 25;
function analyzeProsody(words, pcm, sampleRate) {
  const frameLen = Math.floor(FRAME_MS / 1e3 * sampleRate);
  const frameCount = Math.floor(pcm.length / frameLen);
  const rmsFrames = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const off = f * frameLen;
    for (let i = 0; i < frameLen; i++) {
      const x = pcm[off + i];
      sum += x * x;
    }
    rmsFrames[f] = Math.sqrt(sum / frameLen);
  }
  const wordPeaks = words.map((w) => {
    const a = Math.floor(w.t * 1e3 / FRAME_MS);
    const b = Math.min(frameCount - 1, Math.ceil((w.t + w.d) * 1e3 / FRAME_MS));
    let peak = 0;
    for (let i = a; i <= b; i++) if (rmsFrames[i] > peak) peak = rmsFrames[i];
    return peak;
  });
  const sorted = wordPeaks.slice().sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const hi = sorted[Math.floor(sorted.length * 0.95)] ?? 1;
  const range = Math.max(1e-6, hi - lo);
  return words.map((w, i) => ({
    ...w,
    rms: Math.max(0, Math.min(1, (wordPeaks[i] - lo) / range))
  }));
}

// src/packs/tiktok.js
var tiktok_default = {
  id: "tiktok",
  label: "TikTok bouncy",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 800 7vh/1.0 "Inter", system-ui, sans-serif; color: #fff; text-align: center; text-shadow: 0 4px 0 #000, 0 0 18px var(--cw-accent, #00dcff); letter-spacing: -0.02em; padding: 0 8vw; }
    [data-cw-cap-clip] .word { display: inline-block; transform-origin: 50% 80%; will-change: transform, color, opacity; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: var(--cw-accent, #00dcff); }
  `,
  popThreshold: 0.6,
  enter: { scale: 0.6, y: 12, ease: "back.out(2.4)", dur: 0.18 },
  enterCalm: { scale: 0.85, y: 8, ease: "back.out(1.5)", dur: 0.18 },
  exitDur: 0.12
};

// src/packs/mrbeast.js
var mrbeast_default = {
  id: "mrbeast",
  label: "MrBeast chunky",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 900 9vh/0.95 "Impact", "Anton", system-ui, sans-serif; color: #ffe600; text-align: center; -webkit-text-stroke: 0.4vh #000; text-shadow: 0 6px 0 #000, 0 8px 0 rgba(0,0,0,0.5); letter-spacing: 0; padding: 0 6vw; text-transform: uppercase; }
    [data-cw-cap-clip] .word { display: inline-block; transform-origin: 50% 90%; will-change: transform, color; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: #fff; -webkit-text-stroke-width: 0.6vh; }
  `,
  popThreshold: 0.55,
  enter: { scale: 0.5, y: 0, ease: "back.out(3)", dur: 0.16 },
  enterCalm: { scale: 0.8, y: 0, ease: "back.out(1.6)", dur: 0.16 },
  exitDur: 0.1
};

// src/packs/apple-keynote.js
var apple_keynote_default = {
  id: "apple-keynote",
  label: "Apple keynote",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 200 5vh/1.2 "SF Pro Display", "Inter", system-ui, sans-serif; color: #f5f5f7; text-align: center; letter-spacing: -0.01em; padding: 0 12vw; }
    [data-cw-cap-clip] .word { display: inline-block; will-change: transform, opacity, color; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: var(--cw-accent, #2997ff); font-weight: 400; }
  `,
  popThreshold: 0.7,
  enter: { scale: 1, y: 18, ease: "power2.out", dur: 0.32 },
  enterCalm: { scale: 1, y: 14, ease: "power2.out", dur: 0.32 },
  exitDur: 0.18
};

// src/packs/srt.js
var srt_default = {
  id: "srt",
  label: "Classic SRT",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 600 3.2vh/1.2 ui-sans-serif, system-ui, sans-serif; color: #fff; text-align: center; padding: 6px 14px; background: rgba(0,0,0,0.65); border-radius: 4px; max-width: 80vw; margin: 0 auto; }
    [data-cw-cap-clip] .word { display: inline-block; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: #ffeb3b; }
  `,
  popThreshold: 0.85,
  // rare highlight
  enter: { scale: 1, y: 0, ease: "none", dur: 1e-3 },
  enterCalm: { scale: 1, y: 0, ease: "none", dur: 1e-3 },
  exitDur: 1e-3
};

// src/packs/index.js
var PACKS = [tiktok_default, mrbeast_default, apple_keynote_default, srt_default];
function findPack(id) {
  return PACKS.find((p) => p.id === id) ?? PACKS[0];
}
var DEFAULT_PACK_ID = "tiktok";

// src/decorator.js
var GSAP_VERSION = "3.12.5";
function decorate(html, captionEntries) {
  if (!captionEntries.length) return html;
  const blocks = [];
  for (const c of captionEntries) {
    const pack = findPack(c.packId);
    if (!pack || !c.words?.length) continue;
    blocks.push(renderForClip(c, pack));
  }
  if (!blocks.length) return html;
  return html + "\n" + blocks.join("\n");
}
function renderForClip(c, pack) {
  const safeId = c.clipId.replace(/[^a-z0-9_-]/gi, "");
  const spans = c.words.map((w, i) => `<span class="word" data-i="${i}" data-rms="${(w.rms ?? 0).toFixed(2)}">${escapeHtml(w.w)}</span>`).join(" ");
  const css = `<style data-cw-cap="${safeId}">${pack.css}</style>`;
  const containerStyle = `position:absolute;left:0;right:0;bottom:8vh;pointer-events:none;z-index:9;`;
  const container = `<div data-cw-cap-clip="${safeId}" style="${containerStyle}">${spans}</div>`;
  const tlBody = renderTimelineFactory(c, pack, safeId);
  const script = `<script type="module" data-cw-cap="${safeId}">${tlBody}<\/script>`;
  return css + container + script;
}
function renderTimelineFactory(c, pack, safeId) {
  const lines = [];
  lines.push(`import { gsap } from "https://esm.sh/gsap@${GSAP_VERSION}";`);
  lines.push(`const root = document.querySelector('[data-cw-cap-clip="${safeId}"]');`);
  lines.push(`if (root) {`);
  lines.push(`  const spans = root.querySelectorAll('.word');`);
  lines.push(`  const tl = gsap.timeline({ paused: true });`);
  for (let i = 0; i < c.words.length; i++) {
    const w = c.words[i];
    const popped = (w.rms ?? 0) >= pack.popThreshold;
    const e = popped ? pack.enter : pack.enterCalm;
    lines.push(`  tl.fromTo(spans[${i}], { scale: ${e.scale}, autoAlpha: 0, y: ${e.y} }, { scale: 1, autoAlpha: 1, y: 0, duration: ${e.dur}, ease: ${JSON.stringify(e.ease)}, onStart: () => spans[${i}].classList.toggle('pop', ${popped}) }, ${w.t.toFixed(3)});`);
    lines.push(`  tl.to(spans[${i}], { autoAlpha: 0, duration: ${pack.exitDur} }, ${(w.t + w.d).toFixed(3)});`);
  }
  lines.push(`  const clipStart = ${(c.clipStart ?? 0).toFixed(3)};`);
  lines.push(`  function tick() {`);
  lines.push(`    const media = document.querySelector('video,audio');`);
  lines.push(`    const t = media ? media.currentTime - clipStart : 0;`);
  lines.push(`    tl.seek(Math.max(0, Math.min(tl.duration(), t)));`);
  lines.push(`    requestAnimationFrame(tick);`);
  lines.push(`  }`);
  lines.push(`  tick();`);
  lines.push(`}`);
  return lines.join("\n");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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

// src/panel/mount.js
function mountCaptionsPanel(root, deps) {
  const { onPackChange, onWordEdit, onRegenerate, getActivePackId } = deps;
  root.innerHTML = `
    <div class="ac-wrap">
      <header class="ac-head">
        <div class="ac-title">auto-captions</div>
        <div class="ac-clip">\u2014 pick a clip from the timeline \u2014</div>
      </header>
      <div class="ac-row">
        <div class="ac-section-label">style pack</div>
        <div class="ac-packs"></div>
      </div>
      <div class="ac-row">
        <div class="ac-section-label">transcript</div>
        <div class="ac-words"></div>
      </div>
      <button class="ac-regen" disabled>Re-transcribe</button>
      <div class="ac-status"></div>
    </div>
    <style>
      .ac-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .ac-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .ac-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .ac-clip { color: var(--color-fg); }
      .ac-row { margin-bottom: 10px; }
      .ac-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .ac-packs { display: flex; flex-wrap: wrap; gap: 4px; }
      .ac-pack { padding: 6px 10px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg-muted); cursor: pointer; font: inherit; }
      .ac-pack:hover { border-color: var(--color-fg-muted); }
      .ac-pack.active { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 10%, var(--color-page)); }
      .ac-words { display: flex; flex-wrap: wrap; gap: 3px; max-height: 220px; overflow-y: auto; padding: 6px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; }
      .ac-word { padding: 2px 6px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 3px; font-size: 11px; color: var(--color-fg); cursor: text; outline: none; }
      .ac-word.popped { background: color-mix(in srgb, var(--color-accent) 25%, transparent); border-color: var(--color-accent); font-weight: 600; }
      .ac-word[contenteditable]:focus { border-color: var(--color-accent); }
      .ac-regen { width: 100%; padding: 6px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .ac-regen:disabled { opacity: 0.4; cursor: not-allowed; }
      .ac-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .ac-status.err { color: rgb(255, 120, 120); }
    </style>
  `;
  const packsEl = root.querySelector(".ac-packs");
  const wordsEl = root.querySelector(".ac-words");
  const regenBtn = root.querySelector(".ac-regen");
  const statusEl = root.querySelector(".ac-status");
  const clipEl = root.querySelector(".ac-clip");
  let activePackId = getActivePackId();
  let words = [];
  let popThreshold = 0.6;
  function renderPacks() {
    packsEl.innerHTML = "";
    for (const p of PACKS) {
      const b = document.createElement("button");
      b.className = "ac-pack";
      if (p.id === activePackId) b.classList.add("active");
      b.textContent = p.label;
      b.addEventListener("click", () => {
        activePackId = p.id;
        popThreshold = p.popThreshold;
        renderPacks();
        renderWords();
        onPackChange?.(p.id);
      });
      packsEl.appendChild(b);
    }
  }
  function renderWords() {
    wordsEl.innerHTML = "";
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const span = document.createElement("span");
      span.className = "ac-word";
      if ((w.rms ?? 0) >= popThreshold) span.classList.add("popped");
      span.textContent = w.w;
      span.contentEditable = "true";
      span.spellcheck = false;
      span.addEventListener("blur", () => {
        const next = span.textContent.trim();
        if (next && next !== w.w) onWordEdit?.(i, next);
      });
      wordsEl.appendChild(span);
    }
  }
  regenBtn.addEventListener("click", () => onRegenerate?.());
  renderPacks();
  return {
    setClipLabel(label) {
      clipEl.textContent = label;
      regenBtn.disabled = false;
    },
    setWords(w, threshold) {
      words = w;
      popThreshold = threshold ?? popThreshold;
      renderWords();
    },
    setPack(id) {
      activePackId = id;
      const p = PACKS.find((x) => x.id === id);
      if (p) popThreshold = p.popThreshold;
      renderPacks();
      renderWords();
    },
    setStatus(msg, err = false) {
      statusEl.textContent = msg;
      statusEl.classList.toggle("err", !!err);
    },
    setBusy(b) {
      regenBtn.disabled = b;
    },
    destroy() {
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "auto-captions",
  name: "Auto Captions",
  version: "0.1.0",
  description: "Kinetic-type captions from Whisper word timestamps with prosody-driven emphasis.",
  icon: "Aa",
  surfaces: ["timeline-clip-actions", "panel-tabs", "composition-decorators", "settings"],
  permissions: ["network:api-inference.huggingface.co", "network:huggingface.co", "network:esm.sh"]
};
async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { packId: DEFAULT_PACK_ID, hfToken: "" };
  let activeClip = null;
  let activeClipId = null;
  let panel = null;
  function captionEntries() {
    const out = [];
    for (const k of wb.storage.keys()) {
      if (!k.startsWith("clips/")) continue;
      const v = wb.storage.get(k);
      if (v?.words?.length) out.push(v);
    }
    return out;
  }
  wb.composition.addRenderDecorator({
    priority: 50,
    transform(html) {
      const entries = captionEntries();
      if (!entries.length) return html;
      return decorate(html, entries);
    }
  });
  wb.timeline.addClipAction({
    icon: "Aa",
    label: "Add captions\u2026",
    when: (clip) => clip && (clip.tagName === "video" || clip.tagName === "audio"),
    async onClick(clip) {
      activeClip = clip;
      activeClipId = null;
      panel?.setClipLabel(clip.label || `clip @${clip.start.toFixed(1)}s`);
      panel?.setStatus("ready \u2014 click Re-transcribe");
    }
  });
  wb.panels.addTab({
    id: "auto-captions",
    label: "Captions",
    icon: "Aa",
    component: null,
    mount(root) {
      panel = mountCaptionsPanel(root, {
        getActivePackId: () => defaults.packId,
        async onPackChange(id) {
          defaults = { ...defaults, packId: id };
          await wb.storage.set("defaults", defaults);
          if (activeClipId) {
            const cur = wb.storage.get(`clips/${activeClipId}`);
            if (cur) {
              await wb.storage.set(`clips/${activeClipId}`, { ...cur, packId: id });
              await wb.composition.repaint();
            }
          }
        },
        async onWordEdit(idx, next) {
          if (!activeClipId) return;
          const cur = wb.storage.get(`clips/${activeClipId}`);
          if (!cur) return;
          const words = cur.words.slice();
          words[idx] = { ...words[idx], w: next };
          await wb.storage.set(`clips/${activeClipId}`, { ...cur, words });
          await wb.composition.repaint();
        },
        async onRegenerate() {
          return runTranscribe();
        }
      });
      panel.setPack(defaults.packId);
      if (activeClip) {
        panel.setClipLabel(activeClip.label || `clip @${activeClip.start.toFixed(1)}s`);
      }
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.settings.addSection({
    label: "Captions",
    mount(root) {
      root.innerHTML = `
        <div class="ac-settings">
          <label>HuggingFace token (optional, raises rate limit)
            <input type="password" class="ac-token" placeholder="hf_\u2026" />
          </label>
          <label>default style pack
            <select class="ac-default-pack">${PACKS.map((p) => `<option value="${p.id}">${p.label}</option>`).join("")}</select>
          </label>
          <p class="ac-hint">Captions are baked into the composition HTML. Uninstalling this plugin doesn't break playback \u2014 the spans + style + GSAP factory stay in the file.</p>
        </div>
        <style>
          .ac-settings { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); display: grid; gap: 8px; }
          .ac-settings label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg); }
          .ac-settings input, .ac-settings select { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
          .ac-hint { font-size: 10px; margin: 4px 0 0; line-height: 1.5; }
        </style>
      `;
      const tok = root.querySelector(".ac-token");
      const sel = root.querySelector(".ac-default-pack");
      tok.value = defaults.hfToken;
      sel.value = defaults.packId;
      const save = async () => {
        defaults = { ...defaults, hfToken: tok.value.trim(), packId: sel.value };
        await wb.storage.set("defaults", defaults);
      };
      tok.addEventListener("change", save);
      sel.addEventListener("change", save);
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "add_captions",
      description: "Generate kinetic-type captions for a clip via Whisper. Open the Captions panel for transcription progress + word editing.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number" },
          clip_duration: { type: "number" },
          style_pack: { type: "string", enum: PACKS.map((p) => p.id) }
        },
        required: ["clip_start", "clip_duration"]
      }
    },
    async invoke({ clip_start, clip_duration, style_pack }) {
      return JSON.stringify({
        ok: false,
        message: "Open the timeline \u2192 right-click clip \u2192 'Add captions\u2026'. Headless run requires the panel for word-level review.",
        clip: { start: clip_start, duration: clip_duration },
        style_pack: style_pack ?? defaults.packId
      });
    }
  });
  wb.log(`auto-captions activated`);
  async function runTranscribe() {
    if (!activeClip) {
      panel?.setStatus("no clip selected", true);
      return;
    }
    panel?.setBusy(true);
    panel?.setStatus("loading audio\u2026");
    try {
      const html = await wb.composition.read();
      const src = pickClipSrc(html, activeClip);
      if (!src) throw new Error("clip src not found");
      const blob = await fetch(src).then((r) => r.blob());
      const pcm = await decodeToMono16k(blob);
      panel?.setStatus("transcribing (HF whisper-large-v3)\u2026");
      const wav = pcmToWav(pcm);
      const wordsRaw = await transcribe(wav, { token: defaults.hfToken || null });
      if (!wordsRaw.length) throw new Error("no words detected");
      panel?.setStatus("scoring prosody\u2026");
      const words = analyzeProsody(wordsRaw, pcm, SAMPLE_RATE);
      const id = await clipIdOf(src, activeClip.start, activeClip.duration);
      activeClipId = id;
      const entry = {
        clipId: id,
        packId: defaults.packId,
        words,
        clipStart: activeClip.start,
        clipEnd: activeClip.start + activeClip.duration,
        modelUsed: "whisper-large-v3",
        generatedAt: Date.now()
      };
      await wb.storage.set(`clips/${id}`, entry);
      await wb.composition.repaint();
      const pack = findPack(defaults.packId);
      panel?.setWords(words, pack.popThreshold);
      panel?.setStatus(`${words.length} words \u2014 pack '${pack.label}'`);
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), true);
      wb.log(`auto-captions error: ${e?.message ?? e}`);
    } finally {
      panel?.setBusy(false);
    }
  }
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
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}
export {
  manifest,
  onActivate
};
