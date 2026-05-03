// src/decode.js
var TARGET_RATE = 16e3;
async function decodeToMono16k(blob) {
  const ab = await blob.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  let dec;
  try {
    dec = await ac.decodeAudioData(ab.slice(0));
  } finally {
    ac.close().catch(() => {
    });
  }
  const mono = dec.numberOfChannels > 1 ? mixMono(dec) : dec.getChannelData(0);
  return { pcm: resample(mono, dec.sampleRate, TARGET_RATE), durationS: dec.duration };
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
function resample(input, fromRate, toRate) {
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

// src/transcribe.js
var ENDPOINT = "https://api-inference.huggingface.co/models/openai/whisper-large-v3";
async function transcribe(wavBlob, opts = {}) {
  const headers = { "Content-Type": "audio/wav", "Accept": "application/json" };
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

// src/elevenlabs.js
var BASE = "https://api.elevenlabs.io/v1";
var STOCK_VOICES = [
  // Curated subset of well-known stock voice IDs. Full list comes from
  // /v1/voices once the user provides a key; this is the offline default.
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm narrator female" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", description: "Strong female" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Soft female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", description: "Deep male" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", description: "Crisp male" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Narrator male" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", description: "Raspy male" }
];
async function listVoices(apiKey) {
  if (!apiKey) return STOCK_VOICES;
  const resp = await fetch(`${BASE}/voices`, {
    headers: { "xi-api-key": apiKey, "Accept": "application/json" }
  });
  if (!resp.ok) throw new Error(`voices ${resp.status}`);
  const data = await resp.json();
  return (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    description: v.description ?? v.labels?.description ?? ""
  }));
}
async function synthesize(text, opts = {}) {
  const { apiKey, voiceId, modelId, stability, similarity, style } = opts;
  if (!apiKey) throw new Error("ElevenLabs API key not set \u2014 open Settings \u2192 Voice Redo.");
  if (!voiceId) throw new Error("voice not selected");
  const body = {
    text,
    model_id: modelId ?? "eleven_turbo_v2_5",
    voice_settings: {
      stability: stability ?? 0.5,
      similarity_boost: similarity ?? 0.75,
      style: style ?? 0,
      use_speaker_boost: true
    }
  };
  const resp = await fetch(`${BASE}/text-to-speech/${voiceId}?optimize_streaming_latency=0`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`elevenlabs ${resp.status}: ${t.slice(0, 200)}`);
  }
  return await resp.blob();
}

// src/speedMatch.js
var MAX_STRETCH = 1.18;
var MIN_STRETCH = 0.82;
async function matchDuration(mp3Blob, targetDurationS) {
  const { pcm, durationS } = await decodeToMono16k(mp3Blob);
  const rawRatio = durationS / targetDurationS;
  const ratio = Math.max(MIN_STRETCH, Math.min(MAX_STRETCH, rawRatio));
  if (Math.abs(ratio - 1) < 0.01) {
    return { blob: pcmToWav(pcm), pitchedRatio: 1 };
  }
  const outLen = Math.round(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src), i1 = Math.min(pcm.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
  }
  return { blob: pcmToWav(out, SAMPLE_RATE), pitchedRatio: ratio };
}

// src/diff.js
function transcriptDiff(originalWords, editedText) {
  const editedWords = (editedText || "").split(/\s+/).filter(Boolean);
  const a = originalWords.map((w) => w.w.toLowerCase().replace(/[^\w']/g, ""));
  const b = editedWords.map((w) => w.toLowerCase().replace(/[^\w']/g, ""));
  const lcs = lcsLen(a, b);
  const kept = lcs;
  const inserted = b.length - kept;
  const removed = a.length - kept;
  return { originalLen: a.length, editedLen: b.length, kept, inserted, removed };
}
function lcsLen(a, b) {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return 0;
  const prev = new Int32Array(m + 1);
  const curr = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev.set(curr);
  }
  return prev[m];
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
function mountVoicePanel(root, deps) {
  const { onTranscribe, onRegenerate, onVoiceChange, getDefaults, getVoices } = deps;
  root.innerHTML = `
    <div class="vr-wrap">
      <header class="vr-head">
        <div class="vr-title">voice-redo</div>
        <div class="vr-clip">\u2014 pick a clip from the timeline \u2014</div>
      </header>
      <div class="vr-row">
        <button class="vr-trans" disabled>Transcribe</button>
        <select class="vr-voice"></select>
      </div>
      <div class="vr-section">
        <div class="vr-section-label">transcript (edit freely)</div>
        <textarea class="vr-text" placeholder="(transcript will appear here)" spellcheck="false"></textarea>
      </div>
      <div class="vr-stats"></div>
      <button class="vr-regen" disabled>Regenerate VO</button>
      <div class="vr-status"></div>
    </div>
    <style>
      .vr-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .vr-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .vr-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .vr-clip { color: var(--color-fg); }
      .vr-row { display: grid; grid-template-columns: auto 1fr; gap: 6px; margin-bottom: 8px; }
      .vr-row button, .vr-row select { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .vr-row button:disabled { opacity: 0.4; cursor: not-allowed; }
      .vr-section { margin-bottom: 8px; }
      .vr-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .vr-text { width: 100%; height: 140px; padding: 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); font: 11px ui-monospace, monospace; resize: vertical; }
      .vr-stats { font-size: 10px; color: var(--color-fg); margin-bottom: 6px; min-height: 14px; font-variant-numeric: tabular-nums; }
      .vr-regen { width: 100%; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .vr-regen:disabled { opacity: 0.4; cursor: not-allowed; }
      .vr-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .vr-status.err { color: rgb(255, 120, 120); }
      .vr-status.warn { color: rgb(255, 180, 80); }
    </style>
  `;
  const transBtn = root.querySelector(".vr-trans");
  const regenBtn = root.querySelector(".vr-regen");
  const voiceSel = root.querySelector(".vr-voice");
  const textEl = root.querySelector(".vr-text");
  const statsEl = root.querySelector(".vr-stats");
  const statusEl = root.querySelector(".vr-status");
  const clipEl = root.querySelector(".vr-clip");
  function refreshVoices(voices) {
    voiceSel.innerHTML = voices.map((v) => `<option value="${v.id}">${v.name}${v.description ? " \u2014 " + v.description : ""}</option>`).join("");
    const d = getDefaults();
    if (d.voiceId) voiceSel.value = d.voiceId;
  }
  refreshVoices(getVoices());
  transBtn.addEventListener("click", () => onTranscribe?.());
  regenBtn.addEventListener("click", () => onRegenerate?.(textEl.value));
  voiceSel.addEventListener("change", () => onVoiceChange?.(voiceSel.value));
  textEl.addEventListener("input", () => deps.onTextEdit?.(textEl.value));
  function setStatus(msg, kind = null) {
    statusEl.textContent = msg;
    statusEl.classList.remove("err", "warn");
    if (kind === "err") statusEl.classList.add("err");
    else if (kind === "warn") statusEl.classList.add("warn");
  }
  return {
    setClip(label) {
      clipEl.textContent = label;
      transBtn.disabled = false;
    },
    setTranscript(text) {
      textEl.value = text;
      regenBtn.disabled = !text;
    },
    setStats(stats) {
      if (!stats) {
        statsEl.textContent = "";
        return;
      }
      const changed = stats.inserted + stats.removed;
      const pct = stats.originalLen > 0 ? Math.round(100 * changed / Math.max(1, stats.originalLen)) : 0;
      statsEl.textContent = `kept ${stats.kept}/${stats.originalLen} \xB7 +${stats.inserted} / -${stats.removed} \xB7 \u0394 ${pct}%`;
    },
    setStatus,
    setBusy(b) {
      transBtn.disabled = b;
      regenBtn.disabled = b;
      voiceSel.disabled = b;
    },
    refreshVoices,
    destroy() {
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "voice-redo",
  name: "Voice Redo",
  version: "0.1.0",
  description: "Edit a VO transcript, ElevenLabs regenerates audio at the same duration.",
  icon: "\u{1F399}",
  surfaces: ["timeline-clip-actions", "panel-tabs", "settings", "agent-tools"],
  permissions: ["network:api-inference.huggingface.co", "network:api.elevenlabs.io"]
};
var DEFAULTS = {
  hfToken: "",
  elevenApiKey: "",
  voiceId: STOCK_VOICES[0].id,
  modelId: "eleven_turbo_v2_5",
  stability: 0.5,
  similarity: 0.75,
  style: 0
};
async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { ...DEFAULTS };
  let activeClip = null;
  let activeClipId = null;
  let activeWords = null;
  let activeOriginalText = "";
  let activeDurationS = 0;
  let activeSrc = null;
  let panel = null;
  let voicesCache = STOCK_VOICES;
  async function refreshVoicesFromApi() {
    if (!defaults.elevenApiKey) return;
    try {
      voicesCache = await listVoices(defaults.elevenApiKey);
      panel?.refreshVoices(voicesCache);
    } catch (e) {
      wb.log(`voice-redo: voices fetch failed: ${e?.message ?? e}`);
    }
  }
  wb.timeline.addClipAction({
    icon: "\u{1F399}",
    label: "Edit VO transcript",
    when: (clip) => clip && (clip.tagName === "video" || clip.tagName === "audio"),
    async onClick(clip) {
      activeClip = clip;
      const html = await wb.composition.read();
      const src = pickClipSrc(html, clip);
      activeSrc = src;
      activeClipId = await clipIdOf(src ?? "", clip.start, clip.duration);
      activeDurationS = clip.duration;
      panel?.setClip(clip.label || `clip @${clip.start.toFixed(1)}s`);
      const cached = wb.storage.get(`transcripts/${activeClipId}`);
      if (cached) {
        activeWords = cached.words;
        activeOriginalText = cached.text;
        panel?.setTranscript(cached.text);
        panel?.setStats(transcriptDiff(activeWords, cached.text));
      } else {
        activeWords = null;
        activeOriginalText = "";
        panel?.setTranscript("");
        panel?.setStats(null);
      }
      panel?.setStatus("ready \u2014 Transcribe, then edit");
    }
  });
  wb.panels.addTab({
    id: "voice-redo",
    label: "Voice",
    icon: "\u{1F399}",
    component: null,
    mount(root) {
      panel = mountVoicePanel(root, {
        getDefaults: () => defaults,
        getVoices: () => voicesCache,
        async onVoiceChange(id) {
          defaults = { ...defaults, voiceId: id };
          await wb.storage.set("defaults", defaults);
        },
        onTextEdit(next) {
          if (activeWords) panel?.setStats(transcriptDiff(activeWords, next));
        },
        async onTranscribe() {
          return runTranscribe();
        },
        async onRegenerate(text) {
          return runRegenerate(text);
        }
      });
      refreshVoicesFromApi();
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.settings.addSection({
    label: "Voice Redo",
    mount(root) {
      root.innerHTML = `
        <div class="vrs">
          <label>HuggingFace token (transcription)
            <input class="vrs-hf" type="password" placeholder="hf_\u2026">
          </label>
          <label>ElevenLabs API key
            <input class="vrs-el" type="password" placeholder="sk_\u2026">
          </label>
          <label>model
            <select class="vrs-model">
              <option value="eleven_turbo_v2_5">Turbo v2.5 (fast)</option>
              <option value="eleven_multilingual_v2">Multilingual v2 (quality)</option>
            </select>
          </label>
          <label>stability <span class="vrs-stab-val">0.50</span>
            <input class="vrs-stab" type="range" min="0" max="1" step="0.05" value="0.5">
          </label>
          <label>similarity <span class="vrs-sim-val">0.75</span>
            <input class="vrs-sim" type="range" min="0" max="1" step="0.05" value="0.75">
          </label>
          <label>style <span class="vrs-style-val">0.00</span>
            <input class="vrs-style" type="range" min="0" max="1" step="0.05" value="0">
          </label>
          <p class="vrs-hint">Keys live in this workbook. v0.1 does full re-synth + linear time-stretch (\xB118% pitch). Splice mode + WSOLA queued for v0.1.1; candle-whisper-tiny privacy mode for v0.2.</p>
        </div>
        <style>
          .vrs { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); display: grid; gap: 8px; }
          .vrs label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg); }
          .vrs input, .vrs select { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
          .vrs-hint { font-size: 10px; margin: 4px 0 0; line-height: 1.5; }
        </style>
      `;
      const hf = root.querySelector(".vrs-hf");
      const el = root.querySelector(".vrs-el");
      const model = root.querySelector(".vrs-model");
      const stab = root.querySelector(".vrs-stab");
      const sim = root.querySelector(".vrs-sim");
      const style = root.querySelector(".vrs-style");
      const stabVal = root.querySelector(".vrs-stab-val");
      const simVal = root.querySelector(".vrs-sim-val");
      const styleVal = root.querySelector(".vrs-style-val");
      hf.value = defaults.hfToken;
      el.value = defaults.elevenApiKey;
      model.value = defaults.modelId;
      stab.value = String(defaults.stability);
      sim.value = String(defaults.similarity);
      style.value = String(defaults.style);
      stabVal.textContent = defaults.stability.toFixed(2);
      simVal.textContent = defaults.similarity.toFixed(2);
      styleVal.textContent = defaults.style.toFixed(2);
      const save = async () => {
        defaults = {
          ...defaults,
          hfToken: hf.value.trim(),
          elevenApiKey: el.value.trim(),
          modelId: model.value,
          stability: parseFloat(stab.value),
          similarity: parseFloat(sim.value),
          style: parseFloat(style.value)
        };
        stabVal.textContent = defaults.stability.toFixed(2);
        simVal.textContent = defaults.similarity.toFixed(2);
        styleVal.textContent = defaults.style.toFixed(2);
        await wb.storage.set("defaults", defaults);
        refreshVoicesFromApi();
      };
      for (const elNode of [hf, el, model, stab, sim, style]) {
        elNode.addEventListener("change", save);
        elNode.addEventListener("input", save);
      }
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "voice_redo",
      description: "Re-record a VO clip with a new transcript via ElevenLabs. Returns the new audio asset reference.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number" },
          clip_duration: { type: "number" },
          new_text: { type: "string", description: "Replacement transcript." },
          voice_id: { type: "string", description: "ElevenLabs voice id; defaults to last selected." }
        },
        required: ["clip_start", "clip_duration", "new_text"]
      }
    },
    async invoke({ clip_start, clip_duration, new_text, voice_id }) {
      const html = await wb.composition.read();
      const clip = { start: clip_start, duration: clip_duration, tagName: "audio" };
      const src = pickClipSrc(html, clip);
      if (!src) throw new Error("clip not found");
      activeClip = clip;
      activeSrc = src;
      activeClipId = await clipIdOf(src, clip_start, clip_duration);
      activeDurationS = clip_duration;
      if (voice_id) defaults = { ...defaults, voiceId: voice_id };
      const result = await runRegenerate(new_text);
      return JSON.stringify({ ok: true, ...result });
    }
  });
  wb.log("voice-redo activated");
  async function runTranscribe() {
    if (!activeClip || !activeSrc) {
      panel?.setStatus("no clip selected", "err");
      return;
    }
    panel?.setBusy(true);
    panel?.setStatus("decoding audio\u2026");
    try {
      const blob = await fetch(activeSrc).then((r) => r.blob());
      const { pcm } = await decodeToMono16k(blob);
      const wav = pcmToWav(pcm);
      panel?.setStatus("transcribing (HF whisper-large-v3)\u2026");
      const words = await transcribe(wav, { token: defaults.hfToken || null });
      const text = words.map((w) => w.w).join(" ");
      activeWords = words;
      activeOriginalText = text;
      await wb.storage.set(`transcripts/${activeClipId}`, { words, text, savedAt: Date.now() });
      panel?.setTranscript(text);
      panel?.setStats(transcriptDiff(words, text));
      panel?.setStatus(`${words.length} words \u2014 edit then Regenerate`);
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), "err");
    } finally {
      panel?.setBusy(false);
    }
  }
  async function runRegenerate(newText) {
    if (!activeClip || !activeSrc) throw new Error("no clip selected");
    if (!newText?.trim()) throw new Error("transcript is empty");
    if (!defaults.elevenApiKey) throw new Error("ElevenLabs API key not set \u2014 Settings \u2192 Voice Redo");
    panel?.setBusy(true);
    panel?.setStatus("synthesizing (ElevenLabs)\u2026");
    try {
      const stats = activeWords ? transcriptDiff(activeWords, newText) : null;
      const mp3 = await synthesize(newText, {
        apiKey: defaults.elevenApiKey,
        voiceId: defaults.voiceId,
        modelId: defaults.modelId,
        stability: defaults.stability,
        similarity: defaults.similarity,
        style: defaults.style
      });
      panel?.setStatus("matching duration\u2026");
      const { blob: matched, pitchedRatio } = await matchDuration(mp3, activeDurationS);
      const dataUrl = await blobToDataUrl(matched);
      const html = await wb.composition.read();
      const next = swapClipSrc(html, activeClip, dataUrl);
      await wb.composition.write(next, "voice-redo: regenerate VO");
      await wb.composition.repaint();
      const pitchPct = Math.round((pitchedRatio - 1) * 100);
      const warn = Math.abs(pitchPct) > 10;
      panel?.setStatus(
        `regenerated \xB7 pitch ${pitchPct >= 0 ? "+" : ""}${pitchPct}%${warn ? " (large stretch \u2014 quality degrades)" : ""}`,
        warn ? "warn" : null
      );
      return { stats, pitchPct, warned: warn };
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), "err");
      throw e;
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
function swapClipSrc(html, clip, newSrc) {
  const re = /<(video|audio)\b([^>]*)>/gi;
  let mutated = false;
  return html.replace(re, (full, tag, attrs) => {
    if (mutated) return full;
    const start = parseFloat(attrMatch(attrs, "data-start"));
    const dur = parseFloat(attrMatch(attrs, "data-duration"));
    if (!(Math.abs(start - clip.start) < 0.01 && Math.abs(dur - clip.duration) < 0.01)) return full;
    mutated = true;
    const cleaned = attrs.replace(/\ssrc="[^"]*"/, "");
    return `<${tag}${cleaned} src="${escapeAttr(newSrc)}">`;
  });
}
function attrMatch(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export {
  manifest,
  onActivate
};
