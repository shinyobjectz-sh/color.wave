// auto-captions — kinetic-type captions baked into the composition HTML.
//
// Uses HF Inference (whisper-large-v3, return_timestamps='word') to get
// word-level timing; runs a WebAudio prosody pass to score loudness per
// word; injects a <style>+<div spans>+<script timeline factory> triple
// into the composition for every clip with captions. GSAP from esm.sh
// drives the timeline at play time. Uninstalling the plugin doesn't
// break playback — the HTML carries everything.

import { decodeToMono16k, pcmToWav, SAMPLE_RATE } from "./decode.js";
import { transcribe as transcribeHF } from "./stt/hf.js";
import { analyzeProsody } from "./prosody.js";
import { PACKS, findPack, DEFAULT_PACK_ID } from "./packs/index.js";
import { decorate } from "./decorator.js";
import { clipIdOf } from "./clip-id.js";
import { mountCaptionsPanel } from "./panel/mount.js";

export const manifest = {
  id: "auto-captions",
  name: "Auto Captions",
  version: "0.1.0",
  description: "Kinetic-type captions from Whisper word timestamps with prosody-driven emphasis.",
  icon: "Aa",
  surfaces: ["timeline-clip-actions", "panel-tabs", "composition-decorators", "settings"],
  permissions: ["network:api-inference.huggingface.co", "network:huggingface.co", "network:esm.sh"],
};

export async function onActivate(wb) {
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

  // ── render decorator ──────────────────────────────────────────────
  wb.composition.addRenderDecorator({
    priority: 50,
    transform(html) {
      const entries = captionEntries();
      if (!entries.length) return html;
      return decorate(html, entries);
    },
  });

  // ── timeline clip action ──────────────────────────────────────────
  wb.timeline.addClipAction({
    icon: "Aa",
    label: "Add captions…",
    when: (clip) => clip && (clip.tagName === "video" || clip.tagName === "audio"),
    async onClick(clip) {
      activeClip = clip;
      activeClipId = null;
      panel?.setClipLabel(clip.label || `clip @${clip.start.toFixed(1)}s`);
      panel?.setStatus("ready — click Re-transcribe");
    },
  });

  // ── panel tab ─────────────────────────────────────────────────────
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
        async onRegenerate() { return runTranscribe(); },
      });
      panel.setPack(defaults.packId);
      // If a clip is already selected, re-hydrate the panel from storage
      if (activeClip) {
        panel.setClipLabel(activeClip.label || `clip @${activeClip.start.toFixed(1)}s`);
        // Lookup may not have happened yet; do it lazily on Re-transcribe.
      }
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── settings ──────────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Captions",
    mount(root) {
      root.innerHTML = `
        <div class="ac-settings">
          <label>HuggingFace token (optional, raises rate limit)
            <input type="password" class="ac-token" placeholder="hf_…" />
          </label>
          <label>default style pack
            <select class="ac-default-pack">${PACKS.map(p => `<option value="${p.id}">${p.label}</option>`).join("")}</select>
          </label>
          <p class="ac-hint">Captions are baked into the composition HTML. Uninstalling this plugin doesn't break playback — the spans + style + GSAP factory stay in the file.</p>
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
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "add_captions",
      description: "Generate kinetic-type captions for a clip via Whisper. Open the Captions panel for transcription progress + word editing.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number" },
          clip_duration: { type: "number" },
          style_pack: { type: "string", enum: PACKS.map(p => p.id) },
        },
        required: ["clip_start", "clip_duration"],
      },
    },
    async invoke({ clip_start, clip_duration, style_pack }) {
      return JSON.stringify({
        ok: false,
        message: "Open the timeline → right-click clip → 'Add captions…'. Headless run requires the panel for word-level review.",
        clip: { start: clip_start, duration: clip_duration },
        style_pack: style_pack ?? defaults.packId,
      });
    },
  });

  wb.log(`auto-captions activated`);

  // ── core pipeline ─────────────────────────────────────────────────
  async function runTranscribe() {
    if (!activeClip) { panel?.setStatus("no clip selected", true); return; }
    panel?.setBusy(true);
    panel?.setStatus("loading audio…");
    try {
      const html = await wb.composition.read();
      const src = pickClipSrc(html, activeClip);
      if (!src) throw new Error("clip src not found");
      const blob = await fetch(src).then((r) => r.blob());
      const pcm = await decodeToMono16k(blob);

      panel?.setStatus("transcribing (HF whisper-large-v3)…");
      const wav = pcmToWav(pcm);
      const wordsRaw = await transcribeHF(wav, { token: defaults.hfToken || null });
      if (!wordsRaw.length) throw new Error("no words detected");

      panel?.setStatus("scoring prosody…");
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
        generatedAt: Date.now(),
      };
      await wb.storage.set(`clips/${id}`, entry);
      await wb.composition.repaint();

      const pack = findPack(defaults.packId);
      panel?.setWords(words, pack.popThreshold);
      panel?.setStatus(`${words.length} words — pack '${pack.label}'`);
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), true);
      wb.log(`auto-captions error: ${e?.message ?? e}`);
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

function attrMatch(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}
