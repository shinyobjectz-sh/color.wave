// smart-reframe — subject-aware aspect-ratio reframe.
//
// HOW IT WORKS
// 1. Click a video clip on the timeline → "Reframe…" → choose 9:16/1:1/etc.
// 2. Plugin samples ~4 fps of frames, runs object detection on each
//    (transformers.js yolos-tiny in v0.1; candle-yolov8n queued for v0.2),
//    associates the same subject across frames, smooths the path, and
//    emits a CSS @keyframes block + a clip-path inset for the target ratio.
// 3. The render decorator injects the keyframes any time the composition
//    contains data-smart-reframe="<id>". The composition itself only
//    carries that one tiny attribute — all the path data lives in
//    wb.storage so it round-trips through Cmd+S.

import { RATIOS, SUBJECT_MODES, DEFAULTS, findRatio } from "./presets.js";
import { sampleFrames } from "./sampler.js";
import { detectBitmap, classFilter } from "./detect/transformers-yolos.js";
import { associate } from "./associate.js";
import { solvePath, emitKeyframes } from "./solver.js";
import { tagVideo, makeClipMatcher } from "./compose.js";
import { clipIdOf } from "./clip-id.js";
import { mountPathPanel } from "./ui/pathPanel.js";

export const manifest = {
  id: "smart-reframe",
  name: "Smart Reframe",
  version: "0.1.0",
  description: "Subject-aware aspect-ratio reframe. Solves a smooth pan/zoom path that keeps the main subject in frame.",
  icon: "▭",
  surfaces: ["timeline-clip-actions", "panels", "settings", "composition-decorators"],
  permissions: ["network:cdn.jsdelivr.net", "storage:cache-api"],
};

export async function onActivate(wb) {
  // Persistent state, scoped per workbook:
  //   defaults — settings card values (ratio, subject mode, stride, …)
  //   paths.<clipId> — solved path + ratio + mode for each clip
  let defaults = wb.storage.get("defaults") ?? { ...DEFAULTS };
  // active selection (in-memory only — re-derived from clip click)
  let activeClip = null;
  let activeRatioId = defaults.ratioId;
  let activeMode = defaults.subjectMode;
  let panel = null;

  // ── render decorator: inject @keyframes for every clip with a saved path ──
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
      return html + `\n<style data-smart-reframe-keyframes>\n${blocks.join("\n\n")}\n</style>\n`;
    },
  });

  // ── timeline clip action ───────────────────────────────────────────
  wb.timeline.addClipAction({
    icon: "▭",
    label: "Reframe…",
    when: (clip) => clip && clip.tagName === "video",
    async onClick(clip) {
      activeClip = clip;
      panel?.setClip(clip.label || `clip @${clip.start.toFixed(1)}s`);
      panel?.setStatus("ready — pick ratio + Solve");
    },
  });

  // ── panel tab ──────────────────────────────────────────────────────
  wb.panels.addTab({
    id: "smart-reframe",
    label: "Reframe",
    icon: "▭",
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
        async onSolve() { return runSolve(); },
      });
      panel.setRatio(activeRatioId);
      panel.setMode(activeMode);
      if (activeClip) panel.setClip(activeClip.label || `clip @${activeClip.start.toFixed(1)}s`);
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── settings ───────────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Smart Reframe",
    mount(root) {
      root.innerHTML = `
        <div class="sr-settings">
          <label>default ratio
            <select class="sr-d-ratio">${RATIOS.map(r => `<option value="${r.id}">${r.label}</option>`).join("")}</select>
          </label>
          <label>default subject
            <select class="sr-d-mode">${SUBJECT_MODES.map(m => `<option value="${m.id}">${m.label}</option>`).join("")}</select>
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
      r.value = defaults.ratioId; m.value = defaults.subjectMode; s.value = String(defaults.sampleStrideHz);
      const save = async () => {
        defaults = {
          ...defaults,
          ratioId: r.value,
          subjectMode: m.value,
          sampleStrideHz: parseInt(s.value, 10),
        };
        await wb.storage.set("defaults", defaults);
      };
      r.addEventListener("change", save);
      m.addEventListener("change", save);
      s.addEventListener("change", save);
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ─────────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "reframe_clip",
      description: "Subject-aware reframe of a video clip to a target aspect ratio. Returns a status object — the actual solve runs in the panel for visibility.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number" },
          clip_duration: { type: "number" },
          target_ratio: { type: "string", enum: RATIOS.map(r => r.id) },
          subject: { type: "string", enum: SUBJECT_MODES.map(m => m.id) },
        },
        required: ["clip_start", "clip_duration", "target_ratio"],
      },
    },
    async invoke({ clip_start, clip_duration, target_ratio, subject }) {
      return JSON.stringify({
        ok: false,
        message: "Open the Reframe panel and click Solve. Headless solving requires user-visible progress (12 MB model download on first use).",
        clip: { start: clip_start, duration: clip_duration },
        ratio: target_ratio,
        subject: subject ?? defaults.subjectMode,
      });
    },
  });

  wb.log(`smart-reframe activated`);

  // ── core solve pipeline ────────────────────────────────────────────
  async function runSolve() {
    if (!activeClip) { panel?.setStatus("no clip selected", true); return; }
    panel?.setBusy(true);
    panel?.setStatus("loading clip…");
    try {
      const html = await wb.composition.read();
      const src = pickClipSrc(html, activeClip);
      if (!src) throw new Error("clip src not found");

      panel?.setStatus("sampling frames…");
      const frames = await sampleFrames(src, activeClip.duration, defaults.sampleStrideHz);
      panel?.renderThumbs(frames);
      const fw = frames[0]?.width ?? 1280;
      const fh = frames[0]?.height ?? 720;
      panel?.setSize(fw, fh);

      panel?.setStatus(`detecting (${frames.length} frames)…`);
      const detsByFrame = [];
      const subjectMode = SUBJECT_MODES.find((m) => m.id === activeMode);
      // face mode (MediaPipe fast path) is a TODO — fall back to person.
      const wantClasses = (subjectMode?.id === "face")
        ? ["person"]
        : (subjectMode?.classes ?? null);
      for (let i = 0; i < frames.length; i++) {
        panel?.setStatus(`detecting ${i + 1}/${frames.length}…`);
        const dets = await detectBitmap(frames[i].bitmap, {
          threshold: defaults.minConf,
          onProgress: (loaded, total) => {
            panel?.setStatus(`downloading model ${(loaded / total * 100).toFixed(0)}%`);
          },
        });
        detsByFrame.push({ t: frames[i].t, dets: classFilter(dets, wantClasses) });
      }

      panel?.setStatus("solving path…");
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
        solvedAt: Date.now(),
      });

      const matcher = makeClipMatcher({ start: activeClip.start, duration: activeClip.duration });
      const next = tagVideo(html, matcher, id);
      await wb.composition.write(next, "smart-reframe: tag clip");
      await wb.composition.repaint();

      panel?.setStatus(`solved — ${keyframes.length} keyframes, ${frames.length} samples`);
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), true);
      wb.log(`smart-reframe error: ${e?.message ?? e}`);
    } finally {
      panel?.setBusy(false);
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────

function pickClipSrc(html, clip) {
  const re = /<video\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
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
  const out = new Set();
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return [...out];
}
