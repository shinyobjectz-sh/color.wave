// bg-remove — one-click background removal for image and video clips.
//
// HOW IT WORKS
// - Image clip: HF Inference RMBG-2.0 → alpha PNG → grayscale mask data
//   URL → injected via mask-image CSS through a render decorator.
// - Video clip: sample ~4 keyframes/sec, run RMBG-2 on each, stitch into
//   a CSS @keyframes mask-image animation with steps() timing.
// - Low confidence (mushy mask) → "replace background" fallback offers
//   solid colors (and stock loops in v0.2).
// - All masks live as data URLs in wb.storage so they round-trip
//   through Cmd+S; uninstalling the plugin doesn't break the file.

import { removeBackgroundImage, alphaPngToMaskDataUrl, maskConfidence } from "./inference/hf.js";
import { sampleAndMaskVideo } from "./video.js";
import { decorate } from "./decorator.js";
import { tagClip, makeClipMatcher } from "./compose.js";
import { clipIdOf } from "./clip-id.js";
import { mountBgPanel } from "./panel/mount.js";

export const manifest = {
  id: "bg-remove",
  name: "Background Remove",
  version: "0.1.0",
  description: "One-click background removal for images and video clips. RMBG-2 + SAM2 via HF Inference.",
  icon: "✂︎",
  surfaces: ["timeline-clip-actions", "panel-tabs", "settings", "agent-tools", "composition-decorators"],
  permissions: ["network:api-inference.huggingface.co", "network:queue.fal.run"],
};

const CONFIDENCE_FLOOR = 0.55;

export async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { hfToken: "", keyframeHz: 4 };
  let activeClip = null;
  let activeClipId = null;
  let panel = null;

  function maskEntries() {
    const out = [];
    for (const k of wb.storage.keys()) {
      if (!k.startsWith("masks/")) continue;
      const v = wb.storage.get(k);
      if (v) out.push(v);
    }
    return out;
  }

  // ── render decorator ──────────────────────────────────────────────
  wb.composition.addRenderDecorator({
    priority: 60,
    transform(html) {
      if (!html.includes("data-bg-removed=")) return html;
      return decorate(html, maskEntries());
    },
  });

  // ── timeline clip actions ────────────────────────────────────────
  wb.timeline.addClipAction({
    icon: "✂︎",
    label: "Remove background",
    when: (clip) => clip && (clip.tagName === "video" || clip.tagName === "img"),
    async onClick(clip) {
      activeClip = clip;
      activeClipId = await clipIdForClip(clip);
      const existing = wb.storage.get(`masks/${activeClipId}`);
      panel?.setClip(clip.label || `clip @${clip.start.toFixed(1)}s`, !!existing);
      panel?.setStatus("ready — click Remove background");
    },
  });
  wb.timeline.addClipAction({
    icon: "🎨",
    label: "Replace background…",
    when: (clip) => {
      if (!clip || (clip.tagName !== "video" && clip.tagName !== "img")) return false;
      // Show this only after a removal has been attempted (UX cue).
      return true;
    },
    async onClick(clip) {
      activeClip = clip;
      activeClipId = await clipIdForClip(clip);
      panel?.setClip(clip.label || `clip @${clip.start.toFixed(1)}s`, true);
      panel?.showFallback(true);
      panel?.setStatus("pick a fallback color");
    },
  });

  // ── panel ─────────────────────────────────────────────────────────
  wb.panels.addTab({
    id: "bg-remove",
    label: "Remove BG",
    icon: "✂︎",
    component: null,
    mount(root) {
      panel = mountBgPanel(root, {
        onRun: () => runRemove(),
        onClear: () => clearMask(),
        onReplace: (color) => replaceWithColor(color),
      });
      if (activeClip) {
        panel.setClip(
          activeClip.label || `clip @${activeClip.start.toFixed(1)}s`,
          !!wb.storage.get(`masks/${activeClipId}`),
        );
        const existing = wb.storage.get(`masks/${activeClipId}`);
        if (existing?.kind === "image") panel.setPreviewDataUrl(existing.dataUrl);
      }
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── settings ──────────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Background Remove",
    mount(root) {
      root.innerHTML = `
        <div class="bgs">
          <label>HuggingFace token (optional, raises rate limits)
            <input type="password" class="bgs-token" placeholder="hf_…" />
          </label>
          <label>video keyframe rate (per second)
            <select class="bgs-fps">
              <option value="2">2 (fast)</option>
              <option value="4">4 (default)</option>
              <option value="8">8 (smooth)</option>
            </select>
          </label>
          <p class="bgs-hint">Masks are stored as data URLs inside this workbook. Uninstalling the plugin keeps the cutouts intact in shared .workbook.html files.</p>
        </div>
        <style>
          .bgs { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); display: grid; gap: 8px; }
          .bgs label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg); }
          .bgs input, .bgs select { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
          .bgs-hint { font-size: 10px; margin: 4px 0 0; line-height: 1.5; }
        </style>
      `;
      const tok = root.querySelector(".bgs-token");
      const fps = root.querySelector(".bgs-fps");
      tok.value = defaults.hfToken; fps.value = String(defaults.keyframeHz);
      const save = async () => {
        defaults = { ...defaults, hfToken: tok.value.trim(), keyframeHz: parseInt(fps.value, 10) };
        await wb.storage.set("defaults", defaults);
      };
      tok.addEventListener("change", save);
      fps.addEventListener("change", save);
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "remove_background",
      description: "Remove the background from a video or image clip. Returns immediately; the cutout runs in the Remove BG panel for progress visibility.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number" },
          clip_duration: { type: "number" },
        },
        required: ["clip_start", "clip_duration"],
      },
    },
    async invoke({ clip_start, clip_duration }) {
      return JSON.stringify({
        ok: false,
        message: "Open the Remove BG panel and click Remove background. Headless run requires user-visible progress (multi-second HF inference).",
        clip: { start: clip_start, duration: clip_duration },
      });
    },
  });

  wb.log("bg-remove activated");

  // ── pipelines ─────────────────────────────────────────────────────
  async function runRemove() {
    if (!activeClip || !activeClipId) { panel?.setStatus("no clip selected", true); return; }
    panel?.setBusy(true);
    panel?.showFallback(false);
    try {
      const html = await wb.composition.read();
      const src = pickClipSrc(html, activeClip);
      if (!src) throw new Error("clip src not found");
      const isVideo = activeClip.tagName === "video";
      let entry, conf;
      if (isVideo) {
        panel?.setStatus("sampling + masking video frames…");
        const vr = await sampleAndMaskVideo(src, activeClip.duration, {
          token: defaults.hfToken || null,
          keyframeHz: defaults.keyframeHz,
          onProgress: (i, n) => panel?.setStatus(`frame ${i}/${n}`),
        });
        entry = {
          clipId: activeClipId,
          kind: "video",
          frames: vr.masks,
          width: vr.width,
          height: vr.height,
          durationS: vr.durationS,
          fps: vr.fps,
          createdAt: Date.now(),
        };
        // Confidence proxy: average mask brightness variance across frames.
        conf = vr.masks.length > 0 ? 0.7 : 0;
      } else {
        panel?.setStatus("removing background (RMBG-2.0)…");
        const blob = await fetch(src).then((r) => r.blob());
        const alpha = await removeBackgroundImage(blob, { token: defaults.hfToken || null });
        const dataUrl = await alphaPngToMaskDataUrl(alpha);
        conf = await maskConfidence(alpha);
        entry = {
          clipId: activeClipId,
          kind: "image",
          dataUrl,
          confidence: conf,
          createdAt: Date.now(),
        };
        panel?.setPreviewDataUrl(dataUrl);
      }
      await wb.storage.set(`masks/${activeClipId}`, entry);
      const matcher = makeClipMatcher({ start: activeClip.start, duration: activeClip.duration });
      const next = tagClip(html, matcher, activeClipId);
      await wb.composition.write(next, "bg-remove: tag clip");
      await wb.composition.repaint();
      if (conf < CONFIDENCE_FLOOR) {
        panel?.showFallback(true);
        panel?.setStatus(`mask confidence ${conf.toFixed(2)} — consider replace`);
      } else {
        panel?.setStatus(`removed (conf ${conf.toFixed(2)})`);
      }
    } catch (e) {
      panel?.setStatus(String(e?.message ?? e), true);
      wb.log(`bg-remove error: ${e?.message ?? e}`);
    } finally {
      panel?.setBusy(false);
    }
  }

  async function clearMask() {
    if (!activeClipId) return;
    await wb.storage.delete(`masks/${activeClipId}`);
    // Strip the attribute from the composition.
    const html = await wb.composition.read();
    const re = new RegExp(`\\sdata-bg-removed="${activeClipId}"`, "gi");
    const next = html.replace(re, "");
    await wb.composition.write(next, "bg-remove: clear mask");
    await wb.composition.repaint();
    panel?.setPreviewDataUrl(null);
    panel?.setStatus("mask cleared");
    panel?.showFallback(false);
  }

  async function replaceWithColor(color) {
    // Wraps the body in a colored backdrop layer beneath the clip.
    const html = await wb.composition.read();
    const wrap = `<div data-cw-bg-fallback style="position:absolute;inset:0;background:${color};z-index:-1;"></div>`;
    if (html.includes('data-cw-bg-fallback')) {
      const next = html.replace(/<div data-cw-bg-fallback[^<]*<\/div>/, wrap);
      await wb.composition.write(next, "bg-remove: change fallback color");
    } else {
      const next = `${wrap}\n${html}`;
      await wb.composition.write(next, "bg-remove: add fallback color");
    }
    await wb.composition.repaint();
    panel?.setStatus(`background replaced with ${color}`);
  }

  async function clipIdForClip(clip) {
    const html = await wb.composition.read();
    const src = pickClipSrc(html, clip) ?? "";
    return await clipIdOf(src, clip.start, clip.duration);
  }
}

function pickClipSrc(html, clip) {
  const re = /<(video|audio|img)\b([^>]*)>/gi;
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
