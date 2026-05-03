// src/inference/hf.js
var RMBG_ENDPOINT = "https://api-inference.huggingface.co/models/briaai/RMBG-2.0";
async function removeBackgroundImage(imageBlob, opts = {}) {
  const headers = { "Content-Type": imageBlob.type || "image/png" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  let resp = await fetch(RMBG_ENDPOINT, { method: "POST", headers, body: imageBlob });
  if (resp.status === 503) {
    const eta = Math.min(30, Math.ceil((await safeJson(resp)).estimated_time ?? 6));
    await sleep(eta * 1e3);
    resp = await fetch(RMBG_ENDPOINT, { method: "POST", headers, body: imageBlob });
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`RMBG-2 ${resp.status}: ${t.slice(0, 200)}`);
  }
  const ct = resp.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) {
    const j = await resp.json();
    if (j?.image) {
      const b = await fetch(`data:image/png;base64,${j.image}`).then((r) => r.blob());
      return b;
    }
    throw new Error(`RMBG-2 unexpected response: ${ct}`);
  }
  return await resp.blob();
}
async function alphaPngToMaskDataUrl(alphaPng) {
  const bitmap = await createImageBitmap(alphaPng);
  const w = bitmap.width, h = bitmap.height;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    out.data[i] = a;
    out.data[i + 1] = a;
    out.data[i + 2] = a;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const blob = await c.convertToBlob({ type: "image/png" });
  return await blobToDataUrl(blob);
}
async function maskConfidence(alphaPng) {
  const bitmap = await createImageBitmap(alphaPng);
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0, mid = 0;
  for (let i = 3; i < data.length; i += 4) {
    n++;
    const a = data[i];
    if (a > 30 && a < 225) mid++;
  }
  return n > 0 ? 1 - mid / n : 0;
}
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
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

// src/video.js
async function sampleAndMaskVideo(src, durationS, opts = {}) {
  const fps = opts.keyframeHz ?? 4;
  const count = Math.max(1, Math.floor(durationS * fps));
  const targets = [];
  for (let i = 0; i < count; i++) targets.push((i + 0.5) / count * durationS);
  const v = document.createElement("video");
  v.crossOrigin = opts.crossOrigin ?? "anonymous";
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.src = src;
  await new Promise((res, rej) => {
    v.addEventListener("loadedmetadata", () => res(), { once: true });
    v.addEventListener("error", () => rej(new Error("video load")), { once: true });
  });
  const w = v.videoWidth, h = v.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const masks = [];
  for (let i = 0; i < targets.length; i++) {
    await seek(v, targets[i]);
    ctx.drawImage(v, 0, 0, w, h);
    const frameBlob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    opts.onProgress?.(i + 1, targets.length);
    const alphaPng = await removeBackgroundImage(frameBlob, opts);
    const dataUrl = await alphaPngToMaskDataUrl(alphaPng);
    masks.push({ t: targets[i], dataUrl });
  }
  v.removeAttribute("src");
  v.load();
  return { width: w, height: h, durationS, masks, fps };
}
function seek(v, t) {
  return new Promise((res, rej) => {
    const onSeeked = () => {
      v.removeEventListener("seeked", onSeeked);
      res();
    };
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("error", () => rej(new Error("seek")), { once: true });
    v.currentTime = Math.max(0, Math.min(v.duration - 1e-3, t));
  });
}

// src/decorator.js
function decorate(html, entries) {
  if (!entries.length) return html;
  const blocks = [];
  for (const e of entries) {
    if (e.kind === "image") blocks.push(renderImage(e));
    else if (e.kind === "video") blocks.push(renderVideo(e));
  }
  if (!blocks.length) return html;
  return html + `
<style data-cw-bgremove>
${blocks.join("\n\n")}
</style>
`;
}
function renderImage(e) {
  return `[data-bg-removed="${e.clipId}"] {
  -webkit-mask-image: url("${e.dataUrl}");
  mask-image: url("${e.dataUrl}");
  -webkit-mask-mode: luminance;
  mask-mode: luminance;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}`;
}
function renderVideo(e) {
  const id = e.clipId;
  const frames = e.frames;
  const dur = e.durationS;
  const n = frames.length;
  if (n === 0) return "";
  if (n === 1) {
    return renderImage({ clipId: id, dataUrl: frames[0].dataUrl });
  }
  const animName = `bgr-${id}`;
  const keyframes = frames.map((f, i) => {
    const pct = (i / (n - 1) * 100).toFixed(2);
    return `  ${pct}% { mask-image: url("${f.dataUrl}"); -webkit-mask-image: url("${f.dataUrl}"); }`;
  }).join("\n");
  return `@keyframes ${animName} {
${keyframes}
}
[data-bg-removed="${id}"] {
  -webkit-mask-mode: luminance;
  mask-mode: luminance;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  animation: ${animName} ${dur.toFixed(3)}s steps(${n - 1}, end) both;
}`;
}

// src/compose.js
function tagClip(html, clipMatcher, clipId) {
  const re = /<(video|img|audio)\b([^>]*)>/gi;
  let mutated = false;
  const out = html.replace(re, (full, tag, attrs) => {
    if (mutated) return full;
    if (!clipMatcher(attrs)) return full;
    mutated = true;
    const cleaned = attrs.replace(/\sdata-bg-removed="[^"]*"/, "");
    return `<${tag}${cleaned} data-bg-removed="${clipId}">`;
  });
  if (!mutated) throw new Error("bg-remove: no clip element matched");
  return out;
}
function makeClipMatcher({ start, duration }) {
  return (attrs) => {
    const s = parseFloat(pickAttr(attrs, "data-start"));
    const d = parseFloat(pickAttr(attrs, "data-duration"));
    return Number.isFinite(s) && Number.isFinite(d) && Math.abs(s - start) < 0.01 && Math.abs(d - duration) < 0.01;
  };
}
function pickAttr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : "";
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
function mountBgPanel(root, deps) {
  const { onRun, onClear, onReplace } = deps;
  root.innerHTML = `
    <div class="bg-wrap">
      <header class="bg-head">
        <div class="bg-title">bg-remove</div>
        <div class="bg-clip">\u2014 pick a clip from the timeline \u2014</div>
      </header>
      <div class="bg-row">
        <button class="bg-run" disabled>Remove background</button>
        <button class="bg-clear" disabled>Clear mask</button>
      </div>
      <div class="bg-preview-wrap">
        <div class="bg-section-label">preview</div>
        <div class="bg-preview"></div>
      </div>
      <div class="bg-fallback" hidden>
        <div class="bg-fb-msg">Mask looks soft \u2014 replace background instead?</div>
        <div class="bg-fb-row">
          <button class="bg-fb-color" data-color="#000">Black</button>
          <button class="bg-fb-color" data-color="#fff">White</button>
          <button class="bg-fb-color" data-color="#0e1116">Dark</button>
          <button class="bg-fb-color" data-color="#f5f5f7">Apple grey</button>
        </div>
      </div>
      <div class="bg-status"></div>
    </div>
    <style>
      .bg-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .bg-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .bg-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .bg-clip { color: var(--color-fg); }
      .bg-row { display: flex; gap: 6px; margin-bottom: 10px; }
      .bg-run { flex: 2; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .bg-clear { flex: 1; padding: 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; }
      .bg-run:disabled, .bg-clear:disabled { opacity: 0.4; cursor: not-allowed; }
      .bg-preview-wrap { margin-bottom: 10px; }
      .bg-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .bg-preview { aspect-ratio: 16/9; background: repeating-conic-gradient(#1a1a1a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px; border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden; display: grid; place-items: center; }
      .bg-preview img { max-width: 100%; max-height: 100%; }
      .bg-fallback { padding: 8px; border: 1px solid rgb(255, 180, 80); background: color-mix(in srgb, rgb(255, 180, 80) 12%, var(--color-page)); border-radius: 4px; margin-bottom: 8px; }
      .bg-fb-msg { color: var(--color-fg); margin-bottom: 6px; font-size: 11px; }
      .bg-fb-row { display: flex; gap: 4px; flex-wrap: wrap; }
      .bg-fb-color { padding: 4px 10px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .bg-status { font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .bg-status.err { color: rgb(255, 120, 120); }
    </style>
  `;
  const runBtn = root.querySelector(".bg-run");
  const clearBtn = root.querySelector(".bg-clear");
  const previewEl = root.querySelector(".bg-preview");
  const statusEl = root.querySelector(".bg-status");
  const clipEl = root.querySelector(".bg-clip");
  const fbEl = root.querySelector(".bg-fallback");
  runBtn.addEventListener("click", () => onRun?.());
  clearBtn.addEventListener("click", () => onClear?.());
  fbEl.querySelectorAll(".bg-fb-color").forEach((b) => {
    b.addEventListener("click", () => onReplace?.(b.dataset.color));
  });
  return {
    setClip(label, hasMask) {
      clipEl.textContent = label;
      runBtn.disabled = false;
      clearBtn.disabled = !hasMask;
    },
    setStatus(msg, err = false) {
      statusEl.textContent = msg;
      statusEl.classList.toggle("err", !!err);
    },
    setBusy(b) {
      runBtn.disabled = b;
      clearBtn.disabled = b;
    },
    setPreviewDataUrl(dataUrl) {
      previewEl.innerHTML = "";
      if (!dataUrl) return;
      const img = document.createElement("img");
      img.src = dataUrl;
      previewEl.appendChild(img);
    },
    showFallback(show) {
      fbEl.hidden = !show;
    },
    destroy() {
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "bg-remove",
  name: "Background Remove",
  version: "0.1.0",
  description: "One-click background removal for images and video clips. RMBG-2 + SAM2 via HF Inference.",
  icon: "\u2702\uFE0E",
  surfaces: ["timeline-clip-actions", "panel-tabs", "settings", "agent-tools", "composition-decorators"],
  permissions: ["network:api-inference.huggingface.co", "network:queue.fal.run"]
};
var CONFIDENCE_FLOOR = 0.55;
async function onActivate(wb) {
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
  wb.composition.addRenderDecorator({
    priority: 60,
    transform(html) {
      if (!html.includes("data-bg-removed=")) return html;
      return decorate(html, maskEntries());
    }
  });
  wb.timeline.addClipAction({
    icon: "\u2702\uFE0E",
    label: "Remove background",
    when: (clip) => clip && (clip.tagName === "video" || clip.tagName === "img"),
    async onClick(clip) {
      activeClip = clip;
      activeClipId = await clipIdForClip(clip);
      const existing = wb.storage.get(`masks/${activeClipId}`);
      panel?.setClip(clip.label || `clip @${clip.start.toFixed(1)}s`, !!existing);
      panel?.setStatus("ready \u2014 click Remove background");
    }
  });
  wb.timeline.addClipAction({
    icon: "\u{1F3A8}",
    label: "Replace background\u2026",
    when: (clip) => {
      if (!clip || clip.tagName !== "video" && clip.tagName !== "img") return false;
      return true;
    },
    async onClick(clip) {
      activeClip = clip;
      activeClipId = await clipIdForClip(clip);
      panel?.setClip(clip.label || `clip @${clip.start.toFixed(1)}s`, true);
      panel?.showFallback(true);
      panel?.setStatus("pick a fallback color");
    }
  });
  wb.panels.addTab({
    id: "bg-remove",
    label: "Remove BG",
    icon: "\u2702\uFE0E",
    component: null,
    mount(root) {
      panel = mountBgPanel(root, {
        onRun: () => runRemove(),
        onClear: () => clearMask(),
        onReplace: (color) => replaceWithColor(color)
      });
      if (activeClip) {
        panel.setClip(
          activeClip.label || `clip @${activeClip.start.toFixed(1)}s`,
          !!wb.storage.get(`masks/${activeClipId}`)
        );
        const existing = wb.storage.get(`masks/${activeClipId}`);
        if (existing?.kind === "image") panel.setPreviewDataUrl(existing.dataUrl);
      }
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.settings.addSection({
    label: "Background Remove",
    mount(root) {
      root.innerHTML = `
        <div class="bgs">
          <label>HuggingFace token (optional, raises rate limits)
            <input type="password" class="bgs-token" placeholder="hf_\u2026" />
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
      tok.value = defaults.hfToken;
      fps.value = String(defaults.keyframeHz);
      const save = async () => {
        defaults = { ...defaults, hfToken: tok.value.trim(), keyframeHz: parseInt(fps.value, 10) };
        await wb.storage.set("defaults", defaults);
      };
      tok.addEventListener("change", save);
      fps.addEventListener("change", save);
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "remove_background",
      description: "Remove the background from a video or image clip. Returns immediately; the cutout runs in the Remove BG panel for progress visibility.",
      parameters: {
        type: "object",
        properties: {
          clip_start: { type: "number" },
          clip_duration: { type: "number" }
        },
        required: ["clip_start", "clip_duration"]
      }
    },
    async invoke({ clip_start, clip_duration }) {
      return JSON.stringify({
        ok: false,
        message: "Open the Remove BG panel and click Remove background. Headless run requires user-visible progress (multi-second HF inference).",
        clip: { start: clip_start, duration: clip_duration }
      });
    }
  });
  wb.log("bg-remove activated");
  async function runRemove() {
    if (!activeClip || !activeClipId) {
      panel?.setStatus("no clip selected", true);
      return;
    }
    panel?.setBusy(true);
    panel?.showFallback(false);
    try {
      const html = await wb.composition.read();
      const src = pickClipSrc(html, activeClip);
      if (!src) throw new Error("clip src not found");
      const isVideo = activeClip.tagName === "video";
      let entry, conf;
      if (isVideo) {
        panel?.setStatus("sampling + masking video frames\u2026");
        const vr = await sampleAndMaskVideo(src, activeClip.duration, {
          token: defaults.hfToken || null,
          keyframeHz: defaults.keyframeHz,
          onProgress: (i, n) => panel?.setStatus(`frame ${i}/${n}`)
        });
        entry = {
          clipId: activeClipId,
          kind: "video",
          frames: vr.masks,
          width: vr.width,
          height: vr.height,
          durationS: vr.durationS,
          fps: vr.fps,
          createdAt: Date.now()
        };
        conf = vr.masks.length > 0 ? 0.7 : 0;
      } else {
        panel?.setStatus("removing background (RMBG-2.0)\u2026");
        const blob = await fetch(src).then((r) => r.blob());
        const alpha = await removeBackgroundImage(blob, { token: defaults.hfToken || null });
        const dataUrl = await alphaPngToMaskDataUrl(alpha);
        conf = await maskConfidence(alpha);
        entry = {
          clipId: activeClipId,
          kind: "image",
          dataUrl,
          confidence: conf,
          createdAt: Date.now()
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
        panel?.setStatus(`mask confidence ${conf.toFixed(2)} \u2014 consider replace`);
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
    const html = await wb.composition.read();
    const wrap = `<div data-cw-bg-fallback style="position:absolute;inset:0;background:${color};z-index:-1;"></div>`;
    if (html.includes("data-cw-bg-fallback")) {
      const next = html.replace(/<div data-cw-bg-fallback[^<]*<\/div>/, wrap);
      await wb.composition.write(next, "bg-remove: change fallback color");
    } else {
      const next = `${wrap}
${html}`;
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
