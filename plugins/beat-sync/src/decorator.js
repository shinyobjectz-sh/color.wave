// decorator — inject hit-effect CSS + a tiny runtime that toggles
// `data-beat-hit` on registered elements at beat times.
//
// Cross-plugin contract pinned in core-1aa.9 (letterbox):
//   - CSS variable `--cw-beat-flash` set to a 0..1 pulse value during a hit
//   - `data-beat-hit` attribute toggled on hot elements (1=on, 0=off) for
//     CSS animation hooks
//   - `cw:beat` CustomEvent dispatched on document at every hit
//
// effect: "flash" | "zoom" | "shake" | "none"

export function decorate(html, state) {
  if (!state || !state.enabled || !state.beats?.length) return html;
  const beatJson = JSON.stringify(state.beats.map((b) => ({ t: b.t, d: b.downbeat ? 1 : 0 })));
  const hitMs = state.hitMs ?? 120;
  const css = effectCss(state.effect ?? "flash");
  const shim = runtimeShim();
  return html + `
<style data-beat-sync>
:root { --cw-beat-flash: 0; }
${css}
@keyframes cw-beat-flash { 0% { --cw-beat-flash: 1; } 100% { --cw-beat-flash: 0; } }
</style>
<script type="module" data-beat-sync>
const BEATS = ${beatJson};
const HIT_MS = ${hitMs};
const SCOPE = ${JSON.stringify(state.scope ?? "global")};
${shim}
</script>
`;
}

function effectCss(effect) {
  switch (effect) {
    case "zoom":
      return `
[data-beat-hit="1"] { animation: cw-beat-zoom var(--cw-beat-dur, 120ms) ease-out; }
@keyframes cw-beat-zoom { 0% { transform: scale(1.06); } 100% { transform: scale(1); } }
`;
    case "shake":
      return `
[data-beat-hit="1"] { animation: cw-beat-shake var(--cw-beat-dur, 120ms) ease-in-out; }
@keyframes cw-beat-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
`;
    case "none":
      return ``;
    case "flash":
    default:
      return `
[data-beat-hit="1"] { animation: cw-beat-flash-bg var(--cw-beat-dur, 120ms) ease-out; }
@keyframes cw-beat-flash-bg { 0% { filter: brightness(1.5); } 100% { filter: brightness(1); } }
`;
  }
}

function runtimeShim() {
  return `
const KEY = "__cwBeatSyncBound";
if (window[KEY]) { /* skip duplicate bind */ }
else {
  window[KEY] = true;
  const targets = () => {
    if (SCOPE === "global") return [...document.querySelectorAll("[data-start]"), document.body];
    return [...document.querySelectorAll("[data-beat-hit-target],[data-beat-hit]")];
  };
  let lastBeatIdx = -1;
  function getTime() {
    const v = document.querySelector("video,audio");
    return v ? v.currentTime : (typeof window.cw?.time === "number" ? window.cw.time : 0);
  }
  function tick() {
    const t = getTime();
    let idx = -1;
    for (let i = 0; i < BEATS.length; i++) {
      if (Math.abs(t - BEATS[i].t) < HIT_MS / 2000) { idx = i; break; }
    }
    if (idx >= 0 && idx !== lastBeatIdx) {
      lastBeatIdx = idx;
      document.documentElement.style.setProperty("--cw-beat-flash", "1");
      const beat = BEATS[idx];
      document.dispatchEvent(new CustomEvent("cw:beat", { detail: { t: beat.t, downbeat: !!beat.d } }));
      for (const el of targets()) {
        el.setAttribute("data-beat-hit", "1");
        setTimeout(() => el.setAttribute("data-beat-hit", "0"), HIT_MS);
      }
      setTimeout(() => document.documentElement.style.setProperty("--cw-beat-flash", "0"), HIT_MS);
    }
    requestAnimationFrame(tick);
  }
  tick();
}
`;
}
