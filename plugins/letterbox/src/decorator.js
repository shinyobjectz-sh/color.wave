// decorator — render the letterbox shell on top of the composition.
//
// We append a fixed-position overlay that lives outside the
// composition's flow (so we don't disturb authored layout). The bars
// and vignette are pointer-events:none, so clicks/hovers still reach
// the composition.
//
// Animation: bars start closed (translated off-screen) and slide in
// via a CSS transition when `.is-open` is set. A tiny inline runtime
// listens to playback time and toggles `is-open` so bars sweep in at
// clip-start and out near clip-end.
//
// Vignette pulse: the radial-gradient alpha mixes in `--cw-beat-flash`
// (the contract beat-sync publishes). When beat-sync isn't installed
// the var stays 0 and the vignette is steady.

import { findRatio, barFraction } from "./presets.js";

export function decorate(html, state) {
  if (!state || !state.enabled || state.ratioId === "off") return html;
  const r = findRatio(state.ratioId);
  if (!r || r.ratio === 0) return html;
  const frac = barFraction(r.ratio, r.orientation);
  const fracPct = (frac * 100).toFixed(2);
  const dur = (state.openCloseS ?? 0.6).toFixed(2);
  const ease = state.easing || "cubic-bezier(0.77,0,0.175,1)";
  const barColor = state.barColor || "#000";
  const vignette = (state.vignettePct ?? 35) / 100;
  const openOnClip = state.openOnClip !== false;
  const pulseOnBeat = state.pulseOnBeat !== false;
  const orient = r.orientation;

  return html + `
<style data-cw-letterbox>
.cw-letterbox-overlay {
  position: fixed; inset: 0; pointer-events: none; z-index: 999;
}
.cw-letterbox-bar {
  position: absolute; background: ${barColor};
  transition: transform ${dur}s ${ease}, opacity ${dur}s ${ease};
  ${orient === "h"
    ? `left: 0; right: 0; height: ${fracPct}%;`
    : `top: 0; bottom: 0; width: ${fracPct}%;`}
}
.cw-letterbox-bar--start { ${orient === "h" ? "top: 0; transform: translateY(-100%);" : "left: 0; transform: translateX(-100%);"} }
.cw-letterbox-bar--end   { ${orient === "h" ? "bottom: 0; transform: translateY(100%);" : "right: 0; transform: translateX(100%);"} }
.cw-letterbox-overlay.is-open .cw-letterbox-bar--start,
.cw-letterbox-overlay.is-open .cw-letterbox-bar--end {
  transform: ${orient === "h" ? "translateY(0)" : "translateX(0)"};
}
.cw-letterbox-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 45%,
    rgba(0,0,0, calc(${vignette.toFixed(3)} + var(--cw-beat-flash, 0) * ${pulseOnBeat ? 0.22 : 0})) 100%);
  transition: background 80ms linear;
}
</style>
<div class="cw-letterbox-overlay${openOnClip ? "" : " is-open"}" data-cw-letterbox aria-hidden="true">
  <div class="cw-letterbox-bar cw-letterbox-bar--start"></div>
  <div class="cw-letterbox-bar cw-letterbox-bar--end"></div>
  <div class="cw-letterbox-vignette"></div>
</div>
${openOnClip ? `<script type="module" data-cw-letterbox>
${runtimeShim((state.openCloseS ?? 0.6))}
</script>` : ""}
`;
}

function runtimeShim(openCloseS) {
  return `
const KEY = "__cwLetterboxBound";
if (window[KEY]) { /* already bound */ }
else {
  window[KEY] = true;
  const overlay = document.querySelector('[data-cw-letterbox]');
  if (overlay) {
    const OPEN = ${openCloseS};
    function tick() {
      const v = document.querySelector('video,audio');
      if (!v) { requestAnimationFrame(tick); return; }
      // Find the active clip's [data-start] / [data-duration] window.
      // We approximate: open during [t > 0.1, t < clipEnd - OPEN].
      const t = v.currentTime;
      const total = isFinite(v.duration) ? v.duration : (parseFloat(document.body.getAttribute('data-cw-total')) || 999);
      const opening = t > 0.1 && t < (total - OPEN);
      overlay.classList.toggle('is-open', opening);
      requestAnimationFrame(tick);
    }
    tick();
  }
}`;
}
