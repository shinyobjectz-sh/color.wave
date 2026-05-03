// voice-redo — edit a VO transcript, ElevenLabs regenerates the audio
// at the same duration. The "AI Resolve" workflow.
//
// HOW IT WORKS (v0.1)
// 1. Right-click a video/audio clip → "Edit VO transcript" → opens
//    the panel scoped to that clip.
// 2. "Transcribe" runs HF whisper-large-v3 with word-level timestamps;
//    text fills the editor; transcript is cached in wb.storage by
//    sha256 of the audio so silence-cutter / auto-captions don't pay
//    the call again.
// 3. User edits the text freely; live diff stats update.
// 4. "Regenerate VO" sends the edited text + selected voice to
//    ElevenLabs TTS, decodes the returned MP3, time-stretches it to
//    the original clip duration via simple linear resample (≤±18%
//    pitch shift; warning surfaced when ratio > ±10%), and writes it
//    back into the composition by inlining a fresh data: URL on the
//    matched <audio>/<video> element.
// 5. Splice mode (preserve unchanged regions bit-for-bit, regenerate
//    only edits with WSOLA pitch-preserving stretch) is queued for
//    v0.1.1; v0.1 ships full re-synth only.
// 6. Privacy mode (candle-whisper-tiny in wasm) deferred to v0.2.

import { decodeToMono16k, pcmToWav } from "./decode.js";
import { transcribe } from "./transcribe.js";
import { listVoices, synthesize, STOCK_VOICES } from "./elevenlabs.js";
import { matchDuration } from "./speedMatch.js";
import { transcriptDiff } from "./diff.js";
import { clipIdOf } from "./clip-id.js";
import { mountVoicePanel } from "./panel/mount.js";

export const manifest = {
  id: "voice-redo",
  name: "Voice Redo",
  version: "0.1.0",
  description: "Edit a VO transcript, ElevenLabs regenerates audio at the same duration.",
  icon: "🎙",
  surfaces: ["timeline-clip-actions", "panel-tabs", "settings", "agent-tools"],
  permissions: ["network:api-inference.huggingface.co", "network:api.elevenlabs.io"],
};

const DEFAULTS = {
  hfToken: "",
  elevenApiKey: "",
  voiceId: STOCK_VOICES[0].id,
  modelId: "eleven_turbo_v2_5",
  stability: 0.5,
  similarity: 0.75,
  style: 0.0,
};

export async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { ...DEFAULTS };
  let activeClip = null;
  let activeClipId = null;
  let activeWords = null;
  let activeOriginalText = "";
  let activeDurationS = 0;
  let activeSrc = null;
  let panel = null;
  let voicesCache = STOCK_VOICES;

  // Lazy-refresh voices once an API key is set.
  async function refreshVoicesFromApi() {
    if (!defaults.elevenApiKey) return;
    try {
      voicesCache = await listVoices(defaults.elevenApiKey);
      panel?.refreshVoices(voicesCache);
    } catch (e) {
      wb.log(`voice-redo: voices fetch failed: ${e?.message ?? e}`);
    }
  }

  // ── timeline action ───────────────────────────────────────────────
  wb.timeline.addClipAction({
    icon: "🎙",
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
      // Hydrate cached transcript if present.
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
      panel?.setStatus("ready — Transcribe, then edit");
    },
  });

  // ── panel ─────────────────────────────────────────────────────────
  wb.panels.addTab({
    id: "voice-redo",
    label: "Voice",
    icon: "🎙",
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
        async onTranscribe() { return runTranscribe(); },
        async onRegenerate(text) { return runRegenerate(text); },
      });
      // Try to refresh from API if a key is set.
      refreshVoicesFromApi();
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── settings ──────────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Voice Redo",
    mount(root) {
      root.innerHTML = `
        <div class="vrs">
          <label>HuggingFace token (transcription)
            <input class="vrs-hf" type="password" placeholder="hf_…">
          </label>
          <label>ElevenLabs API key
            <input class="vrs-el" type="password" placeholder="sk_…">
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
          <p class="vrs-hint">Keys live in this workbook. v0.1 does full re-synth + linear time-stretch (±18% pitch). Splice mode + WSOLA queued for v0.1.1; candle-whisper-tiny privacy mode for v0.2.</p>
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
          style: parseFloat(style.value),
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
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
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
          voice_id: { type: "string", description: "ElevenLabs voice id; defaults to last selected." },
        },
        required: ["clip_start", "clip_duration", "new_text"],
      },
    },
    async invoke({ clip_start, clip_duration, new_text, voice_id }) {
      // Find the clip in composition by start/duration.
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
    },
  });

  wb.log("voice-redo activated");

  // ── pipelines ─────────────────────────────────────────────────────
  async function runTranscribe() {
    if (!activeClip || !activeSrc) { panel?.setStatus("no clip selected", "err"); return; }
    panel?.setBusy(true);
    panel?.setStatus("decoding audio…");
    try {
      const blob = await fetch(activeSrc).then((r) => r.blob());
      const { pcm } = await decodeToMono16k(blob);
      const wav = pcmToWav(pcm);
      panel?.setStatus("transcribing (HF whisper-large-v3)…");
      const words = await transcribe(wav, { token: defaults.hfToken || null });
      const text = words.map((w) => w.w).join(" ");
      activeWords = words;
      activeOriginalText = text;
      await wb.storage.set(`transcripts/${activeClipId}`, { words, text, savedAt: Date.now() });
      panel?.setTranscript(text);
      panel?.setStats(transcriptDiff(words, text));
      panel?.setStatus(`${words.length} words — edit then Regenerate`);
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), "err");
    } finally {
      panel?.setBusy(false);
    }
  }

  async function runRegenerate(newText) {
    if (!activeClip || !activeSrc) throw new Error("no clip selected");
    if (!newText?.trim()) throw new Error("transcript is empty");
    if (!defaults.elevenApiKey) throw new Error("ElevenLabs API key not set — Settings → Voice Redo");
    panel?.setBusy(true);
    panel?.setStatus("synthesizing (ElevenLabs)…");
    try {
      const stats = activeWords ? transcriptDiff(activeWords, newText) : null;
      const mp3 = await synthesize(newText, {
        apiKey: defaults.elevenApiKey,
        voiceId: defaults.voiceId,
        modelId: defaults.modelId,
        stability: defaults.stability,
        similarity: defaults.similarity,
        style: defaults.style,
      });
      panel?.setStatus("matching duration…");
      const { blob: matched, pitchedRatio } = await matchDuration(mp3, activeDurationS);
      const dataUrl = await blobToDataUrl(matched);
      // Replace the matched clip's src in the composition.
      const html = await wb.composition.read();
      const next = swapClipSrc(html, activeClip, dataUrl);
      await wb.composition.write(next, "voice-redo: regenerate VO");
      await wb.composition.repaint();
      const pitchPct = Math.round((pitchedRatio - 1) * 100);
      const warn = Math.abs(pitchPct) > 10;
      panel?.setStatus(
        `regenerated · pitch ${pitchPct >= 0 ? "+" : ""}${pitchPct}%${warn ? " (large stretch — quality degrades)" : ""}`,
        warn ? "warn" : null,
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

// ── helpers ──────────────────────────────────────────────────────────

function pickClipSrc(html, clip) {
  const re = /<(video|audio)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
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
