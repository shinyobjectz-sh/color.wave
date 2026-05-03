// silence-cutter — Whisper-aware silence removal with a single bezier
// curve replacing twelve Premiere sliders.
//
// HOW IT WORKS
// - Timeline clip action "Find silences" extracts the clip's audio
//   blob, decodes to mono 16 kHz, sends to HF whisper-large-v3 with
//   word-level timestamps.
// - Word array → policy.js (gaps > 250 ms = silence; one bezier curve
//   maps each silence to a drop window with attack pad, decay pad, and
//   crossfade depth).
// - Tighten button calls apply.js which mutates the composition by
//   adding a `data-cuts` attribute on the matched <video>/<audio>.
//   A render decorator injects a 60-line runtime adapter that honors
//   data-cuts at play time with WebAudio gain crossfades.
//
// The bezier preset + last curve persist via wb.storage and round-trip
// through Cmd+S along with the rest of the workbook.

import { PRESETS, findPreset, DEFAULT_PRESET_ID } from "./presets.js";
import { mountPanel } from "./panel.js";
import { decodeToMono16k, pcmToWav, SAMPLE_RATE } from "./decode.js";
import { transcribe as transcribeCloud } from "./whisper-cloud.js";
import { computeCuts } from "./policy.js";
import { applyCutsToClip, makeClipMatcher, RUNTIME_SHIM } from "./apply.js";

export const manifest = {
  id: "silence-cutter",
  name: "Silence Cutter",
  version: "0.1.0",
  description: "Whisper-aware silence removal. One bezier curve replaces twelve Premiere sliders.",
  icon: "✂️",
  surfaces: ["panel-tabs", "timeline-clip-actions", "settings", "agent-tools", "composition-decorators"],
  permissions: [
    "network:api-inference.huggingface.co",
    "storage:indexeddb",
  ],
};

const DEFAULT_CURVE = (() => {
  const p = findPreset(DEFAULT_PRESET_ID);
  return {
    p1: { ...p.p1 },
    p2: { ...p.p2 },
    attackMaxMs: p.attackMaxMs,
    decayMaxMs: p.decayMaxMs,
    crossfadeMaxMs: p.crossfadeMaxMs,
  };
})();

export async function onActivate(wb) {
  // ── persistent state ───────────────────────────────────────────
  let curve = wb.storage.get("curve") ?? DEFAULT_CURVE;
  let activePresetId = wb.storage.get("preset") ?? DEFAULT_PRESET_ID;
  let hfToken = wb.storage.get("hfToken") ?? "";

  // Last selected clip — opening the panel before clicking a clip
  // shows an empty state.
  let activeClip = null;
  let activeAudio = null; // { buffer, sampleRate, durationS, blob }
  let activeWords = null;
  let panelInstance = null;

  // ── render decorator: inject the runtime adapter so data-cuts are
  // honored at play time, even after the plugin is uninstalled. ─
  wb.composition.addRenderDecorator({
    priority: 50,
    transform(html) {
      if (!html.includes('data-cuts=')) return html;
      // Inject once. The shim self-guards via window.__cwSilenceCutterShim.
      return html + `\n<script data-silence-cutter>${RUNTIME_SHIM}</script>`;
    },
  });

  // ── panel tab ──────────────────────────────────────────────────
  wb.panels.addTab({
    id: "silence-cutter",
    label: "Cuts",
    icon: "✂️",
    component: null, // no Svelte build; using mount fallback below
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
            duration: activeClip.duration,
          });
          const next = applyCutsToClip(html, matcher, cuts);
          await wb.composition.write(next, "silence-cutter: tighten clip");
          await wb.composition.repaint();
        },
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
    },
  });

  // ── timeline clip action ───────────────────────────────────────
  wb.timeline.addClipAction({
    icon: "✂",
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
          blob,
        };
        panelInstance?.setClip(clip);
        panelInstance?.setAudio(pcm, SAMPLE_RATE, activeAudio.durationS);
        panelInstance?.setStatus("transcribing…");
        const wav = pcmToWav(pcm);
        const words = await transcribeCloud(wav, { token: hfToken || null });
        activeWords = words;
        panelInstance?.setWords(words);
        panelInstance?.setStatus(`${words.length} words detected`);
      } catch (e) {
        panelInstance?.setStatus(String(e?.message ?? e), true);
        wb.log(`silence-cutter error: ${e?.message ?? e}`);
      }
    },
  });

  // ── settings ───────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Silence Cutter",
    mount(root) {
      root.innerHTML = `
        <div class="sc-settings">
          <label>HuggingFace token (optional, raises rate limit)
            <input type="password" class="sc-token" placeholder="hf_…" />
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
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ─────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "tighten_clip",
      description: "Remove silences from a clip in the composition. Returns the proposed cut list as JSON; the user must approve in the panel before mutation.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number", description: "data-start of the target clip (seconds)" },
          clip_duration: { type: "number", description: "data-duration of the target clip (seconds)" },
          preset: { type: "string", enum: PRESETS.map(p => p.id), description: "Bezier preset; defaults to 'natural'." },
        },
        required: ["clip_start", "clip_duration"],
      },
    },
    async invoke({ clip_start, clip_duration, preset }) {
      const presetDef = preset ? findPreset(preset) : findPreset(DEFAULT_PRESET_ID);
      if (!presetDef) throw new Error(`unknown preset: ${preset}`);
      const c = {
        p1: { ...presetDef.p1 }, p2: { ...presetDef.p2 },
        attackMaxMs: presetDef.attackMaxMs,
        decayMaxMs: presetDef.decayMaxMs,
        crossfadeMaxMs: presetDef.crossfadeMaxMs,
      };
      // Synthesize: ask the user to open the panel first; the agent
      // doesn't have a path to fetch arbitrary clip audio without UI.
      return JSON.stringify({
        ok: false,
        message: "Open the timeline, right-click the clip → Find silences. The agent can't yet run transcription headlessly; the panel will show the proposed cuts so you can approve.",
        clip: { start: clip_start, duration: clip_duration },
        preset: presetDef.id,
        curve: c,
      });
    },
  });

  wb.log(`silence-cutter activated (preset=${activePresetId})`);
}

// ── helpers ────────────────────────────────────────────────────────

/**
 * Find the matching <video|audio data-start data-duration> element in
 * the composition HTML and pull its src. Clips parsed by
 * composition.svelte.js don't carry `src` directly, so we re-read it
 * from the source HTML.
 */
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
  const re = new RegExp(`\\s${name}="([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? m[1] : "";
}

/**
 * Fetch a clip's audio bytes as a Blob. The src may be a regular URL,
 * a blob: URL into the workbook's asset table, or a data: URL.
 */
async function fetchClipAudio(src) {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`fetch clip ${resp.status}`);
  return await resp.blob();
}
