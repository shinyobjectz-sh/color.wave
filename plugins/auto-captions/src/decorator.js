// decorator — render-decorator transform that bakes captions into the
// composition HTML for every clip with stored captions.
//
// For each `paths` storage entry of shape:
//   { clipId, packId, words[], clipStart, clipEnd, hidden? }
// we inject:
//   <style data-cw-cap="<clipId>">…pack CSS…</style>
//   <div  data-cw-cap-clip="<clipId>" style="absolute pos…">…spans…</div>
//   <script data-cw-cap="<clipId>">…GSAP timeline factory…</script>
//
// The output is self-contained: GSAP loaded from esm.sh; uninstalling
// the plugin doesn't break captions because the HTML keeps everything.

import { findPack } from "./packs/index.js";

const GSAP_VERSION = "3.12.5";

export function decorate(html, captionEntries) {
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
  const spans = c.words
    .map((w, i) => `<span class="word" data-i="${i}" data-rms="${(w.rms ?? 0).toFixed(2)}">${escapeHtml(w.w)}</span>`)
    .join(" ");
  const css = `<style data-cw-cap="${safeId}">${pack.css}</style>`;
  const containerStyle = `position:absolute;left:0;right:0;bottom:8vh;pointer-events:none;z-index:9;`;
  const container = `<div data-cw-cap-clip="${safeId}" style="${containerStyle}">${spans}</div>`;
  const tlBody = renderTimelineFactory(c, pack, safeId);
  const script = `<script type="module" data-cw-cap="${safeId}">${tlBody}</script>`;
  return css + container + script;
}

function renderTimelineFactory(c, pack, safeId) {
  // Each word: enter at w.t (relative to clip start), exit at w.t + w.d.
  // Pop class toggled when rms ≥ pack.popThreshold.
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
  // Bind to nearest <video>/<audio>'s currentTime offset by clipStart.
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
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
