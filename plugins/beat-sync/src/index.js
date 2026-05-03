// beat-sync — beat-detect a track, snap clip cuts to beats, flash transitions.
//
// HOW IT WORKS
// 1. Drop an audio file in the panel; we decode to mono float32, run a
//    spectral-flux onset detector, autocorrelate the flux envelope to get
//    BPM, then phase-align a beat grid.
// 2. "Snap clips" finds each clip's nearest beat within tolerance and
//    rewrites data-start in the composition source.
// 3. A render decorator emits CSS keyframes + a tiny runtime that listens
//    to the playhead and toggles data-beat-hit on registered elements,
//    triggering a chosen hit effect (flash/zoom/shake/none).
// 4. Cross-plugin contract: dispatches a `cw:beat` CustomEvent and sets
//    `--cw-beat-flash` on :root, so other plugins (letterbox) can react.

import { detectOnsets } from "./detect/flux.js";
import { estimateBeats } from "./detect/tempo.js";
import { snapClipsToBeats } from "./snap.js";
import { decorate } from "./decorator.js";
import { mountBeatPanel } from "./ui/panel.js";

export const manifest = {
  id: "beat-sync",
  name: "Beat Sync",
  version: "0.1.0",
  description: "Beat-detect a track and snap clip cuts to beats with optional flash/zoom/shake hit effects.",
  icon: "♪",
  surfaces: ["panel-tabs", "timeline-clip-actions", "settings", "agent-tools", "composition-decorators"],
  permissions: [],
};

const DEFAULT_STATE = {
  enabled: false,
  beats: [],
  bpm: 0,
  effect: "flash",
  hitMs: 120,
  scope: "global",
  trackName: null,
  trackHash: null,
  pcmRate: 16000,
};

export async function onActivate(wb) {
  let state = wb.storage.get("state") ?? { ...DEFAULT_STATE };
  let pcm = null;     // current decoded audio (not persisted — re-load to redetect)
  let pcmRate = state.pcmRate;
  let panel = null;

  // ── render decorator ──────────────────────────────────────────────
  wb.composition.addRenderDecorator({
    priority: 70,
    transform(html) {
      return decorate(html, state);
    },
  });

  // ── panel ─────────────────────────────────────────────────────────
  wb.panels.addTab({
    id: "beat-sync",
    label: "Beats",
    icon: "♪",
    component: null,
    mount(root) {
      panel = mountBeatPanel(root, {
        getState: () => state,
        async onTrackLoad(file) {
          panel?.setStatus("decoding…");
          try {
            const ab = await file.arrayBuffer();
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            let dec;
            try { dec = await ac.decodeAudioData(ab.slice(0)); }
            finally { ac.close().catch(() => {}); }
            const mono = dec.numberOfChannels > 1 ? mixMono(dec) : dec.getChannelData(0);
            pcm = mono;
            pcmRate = dec.sampleRate;
            state = { ...state, trackName: file.name, trackHash: await hashAB(ab), pcmRate };
            await wb.storage.set("state", state);
            panel?.setBuffer(pcm, pcmRate);
            panel?.setStatus(`loaded · ${(dec.duration).toFixed(1)}s @ ${pcmRate}Hz`);
          } catch (e) {
            panel?.setStatus(String(e?.message ?? e), true);
          }
        },
        async onDetect() {
          if (!pcm) { panel?.setStatus("no track loaded", true); return; }
          panel?.setBusy(true);
          panel?.setStatus("detecting…");
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
          if (!state.beats?.length) { panel?.setStatus("detect beats first", true); return; }
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
        },
      });
      panel.setBeats(state.beats || [], state.bpm || 0);
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── timeline clip action: snap a single clip ──────────────────────
  wb.timeline.addClipAction({
    icon: "♪",
    label: "Snap to nearest beat",
    when: (clip) => clip && state.beats?.length > 0,
    async onClick(clip) {
      const html = await wb.composition.read();
      // Build a tiny per-clip filter: snap only this clip by start match.
      const tolS = 0.4; // generous for single-clip explicit action
      const re = new RegExp(`<([a-z][a-z0-9]*)\\b([^>]*\\sdata-start=)"${clip.start.toFixed(3).replace(".", "\\.")}"([^>]*)>`, "i");
      const sorted = state.beats.slice().sort((a, b) => a.t - b.t);
      const nearest = nearestBeat(sorted, clip.start);
      if (!nearest || Math.abs(nearest.t - clip.start) > tolS) return;
      const next = html.replace(re, (full, tag, pre, post) => `<${tag}${pre}"${nearest.t.toFixed(3)}"${post}>`);
      if (next !== html) {
        await wb.composition.write(next, "beat-sync: snap clip");
        await wb.composition.repaint();
      }
    },
  });

  // ── settings ──────────────────────────────────────────────────────
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
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "snap_to_beats",
      description: "Snap clip starts to beats from a previously-loaded track. Fails if no beats are loaded; the user must drop a track + click Detect first.",
      parameters: {
        type: "object",
        properties: {
          tolerance_ms: { type: "number", minimum: 10, maximum: 500 },
        },
      },
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
    },
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
    for (let i = 0; i < u8.length; i += 17) h = ((h << 5) + h + u8[i]) >>> 0;
    return h.toString(16).padStart(8, "0");
  }
  const buf = await crypto.subtle.digest("SHA-256", ab);
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nearestBeat(sorted, t) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const cands = [];
  if (lo > 0) cands.push(sorted[lo - 1]);
  if (lo < sorted.length) cands.push(sorted[lo]);
  if (!cands.length) return null;
  return cands.reduce((a, b) => Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b);
}
