// src/presets.js
var RATIOS = [
  { id: "off", label: "Off", ratio: 0, orientation: "h" },
  { id: "239", label: "Cinema (2.39:1)", ratio: 2.39, orientation: "h" },
  { id: "220", label: "70mm (2.20:1)", ratio: 2.2, orientation: "h" },
  { id: "185", label: "Widescreen (1.85:1)", ratio: 1.85, orientation: "h" },
  { id: "43", label: "Vintage (4:3 pillar)", ratio: 4 / 3, orientation: "v" }
];
function findRatio(id) {
  return RATIOS.find((r) => r.id === id) ?? RATIOS[0];
}
var DEFAULT_RATIO_ID = "239";
function barFraction(ratio, orientation, source = 16 / 9) {
  if (!ratio || ratio === 0) return 0;
  if (orientation === "h") {
    if (ratio <= source) return 0;
    const targetH = source / ratio;
    return (1 - targetH) / 2;
  } else {
    if (ratio >= source) return 0;
    const targetW = ratio / source;
    return (1 - targetW) / 2;
  }
}

// src/decorator.js
function decorate(html, state) {
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
  ${orient === "h" ? `left: 0; right: 0; height: ${fracPct}%;` : `top: 0; bottom: 0; width: ${fracPct}%;`}
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
${runtimeShim(state.openCloseS ?? 0.6)}
<\/script>` : ""}
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

// src/settings.js
var BAR_COLORS = [
  { id: "black", label: "Black", value: "#000" },
  { id: "graphite", label: "Graphite", value: "#0a0a0a" },
  { id: "ink", label: "Ink", value: "#101015" }
];
var EASINGS = [
  { id: "cinema", label: "Cinema", value: "cubic-bezier(0.77,0,0.175,1)" },
  { id: "easeio", label: "Ease in/out", value: "ease-in-out" },
  { id: "linear", label: "Linear", value: "linear" }
];
function mountSettings(root, deps) {
  const { getState, setState } = deps;
  root.innerHTML = `
    <div class="lb-wrap">
      <header class="lb-head">
        <div class="lb-meta">
          <span class="lb-label">letterbox</span>
          <span class="lb-state-val">off</span>
        </div>
        <button class="lb-toggle" type="button" role="switch" aria-checked="false" title="Toggle letterbox">
          <span class="lb-toggle-track"><span class="lb-toggle-knob"></span></span>
        </button>
      </header>

      <div class="lb-section">
        <div class="lb-section-label">aspect ratio</div>
        <div class="lb-ratios"></div>
      </div>
      <div class="lb-row">
        <label>bar color
          <select class="lb-color">${BAR_COLORS.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}</select>
        </label>
        <label>easing
          <select class="lb-ease">${EASINGS.map((e) => `<option value="${e.value}">${e.label}</option>`).join("")}</select>
        </label>
      </div>
      <div class="lb-row">
        <label>vignette <span class="lb-vig-val">35%</span>
          <input class="lb-vig" type="range" min="0" max="100" value="35" />
        </label>
        <label>open/close <span class="lb-dur-val">0.6s</span>
          <input class="lb-dur" type="range" min="0.2" max="1.5" step="0.05" value="0.6" />
        </label>
      </div>
      <div class="lb-toggles">
        <label class="lb-tog"><input type="checkbox" class="lb-anim" checked /> Open/close on clip</label>
        <label class="lb-tog"><input type="checkbox" class="lb-pulse" checked /> Pulse on beat</label>
      </div>
    </div>
    <style>
      .lb-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); }
      .lb-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 10px; }
      .lb-meta { display: inline-flex; align-items: baseline; gap: 8px; }
      .lb-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .lb-state-val { color: var(--color-fg); font-weight: 600; }
      .lb-toggle { background: transparent; border: 0; padding: 0; cursor: pointer; }
      .lb-toggle-track { position: relative; display: inline-block; width: 30px; height: 16px; background: var(--color-border); border-radius: 999px; }
      .lb-toggle-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; background: var(--color-fg-muted); border-radius: 999px; transition: transform 120ms ease, background 120ms ease; }
      .lb-toggle[aria-checked="true"] .lb-toggle-track { background: var(--color-accent); }
      .lb-toggle[aria-checked="true"] .lb-toggle-knob { background: var(--color-accent-fg); transform: translateX(14px); }
      .lb-section { margin-bottom: 10px; }
      .lb-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .lb-ratios { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px; }
      .lb-ratio { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg-muted); cursor: pointer; font: 11px ui-monospace, monospace; text-align: left; }
      .lb-ratio.active { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 10%, var(--color-page)); }
      .lb-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .lb-row label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .lb-row select, .lb-row input { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: 11px ui-monospace, monospace; }
      .lb-toggles { display: flex; gap: 16px; padding: 6px 0; }
      .lb-tog { display: inline-flex; align-items: center; gap: 6px; color: var(--color-fg); }
    </style>
  `;
  const stateValEl = root.querySelector(".lb-state-val");
  const toggleBtn = root.querySelector(".lb-toggle");
  const ratiosEl = root.querySelector(".lb-ratios");
  const colorSel = root.querySelector(".lb-color");
  const easeSel = root.querySelector(".lb-ease");
  const vig = root.querySelector(".lb-vig");
  const vigVal = root.querySelector(".lb-vig-val");
  const dur = root.querySelector(".lb-dur");
  const durVal = root.querySelector(".lb-dur-val");
  const animCb = root.querySelector(".lb-anim");
  const pulseCb = root.querySelector(".lb-pulse");
  let state = getState();
  function refreshHeader() {
    toggleBtn.setAttribute("aria-checked", state.enabled ? "true" : "false");
    if (state.enabled) {
      const r = RATIOS.find((x) => x.id === state.ratioId);
      stateValEl.textContent = `on \xB7 ${r?.label ?? state.ratioId}`;
    } else {
      stateValEl.textContent = "off";
    }
  }
  function refreshRatios() {
    ratiosEl.innerHTML = "";
    for (const r of RATIOS) {
      const b = document.createElement("button");
      b.className = "lb-ratio";
      if (r.id === state.ratioId) b.classList.add("active");
      b.textContent = r.label;
      b.addEventListener("click", async () => {
        state = { ...state, ratioId: r.id, enabled: r.id !== "off" };
        await setState(state);
        refreshHeader();
        refreshRatios();
      });
      ratiosEl.appendChild(b);
    }
  }
  toggleBtn.addEventListener("click", async () => {
    state = { ...state, enabled: !state.enabled };
    await setState(state);
    refreshHeader();
  });
  colorSel.value = state.barColor;
  easeSel.value = state.easing;
  vig.value = String(state.vignettePct);
  vigVal.textContent = `${state.vignettePct}%`;
  dur.value = String(state.openCloseS);
  durVal.textContent = `${state.openCloseS}s`;
  animCb.checked = state.openOnClip !== false;
  pulseCb.checked = state.pulseOnBeat !== false;
  const persist = async () => {
    state = {
      ...state,
      barColor: colorSel.value,
      easing: easeSel.value,
      vignettePct: parseInt(vig.value, 10),
      openCloseS: parseFloat(dur.value),
      openOnClip: animCb.checked,
      pulseOnBeat: pulseCb.checked
    };
    vigVal.textContent = `${state.vignettePct}%`;
    durVal.textContent = `${state.openCloseS}s`;
    await setState(state);
  };
  for (const el of [colorSel, easeSel, vig, dur, animCb, pulseCb]) {
    el.addEventListener("input", persist);
    el.addEventListener("change", persist);
  }
  refreshHeader();
  refreshRatios();
  return {
    onStateChange(s) {
      state = s;
      refreshHeader();
      refreshRatios();
    },
    destroy() {
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "letterbox",
  name: "Letterbox",
  version: "0.1.0",
  description: "Cinematic bars + vignette pulse. Composes with beat-sync via the cw:beat / --cw-beat-flash contract.",
  icon: "\u25AD",
  surfaces: ["composition-decorators", "settings", "agent-tools"],
  permissions: []
};
var DEFAULTS = {
  enabled: false,
  ratioId: DEFAULT_RATIO_ID,
  barColor: "#000",
  vignettePct: 35,
  openCloseS: 0.6,
  easing: "cubic-bezier(0.77,0,0.175,1)",
  openOnClip: true,
  pulseOnBeat: true
};
async function onActivate(wb) {
  let state = wb.storage.get("state") ?? { ...DEFAULTS };
  let panel = null;
  wb.composition.addRenderDecorator({
    priority: 220,
    // run after palette-swap (100) and colorgrade (200)
    transform(html) {
      return decorate(html, state);
    }
  });
  wb.settings.addSection({
    label: "Letterbox",
    mount(root) {
      panel = mountSettings(root, {
        getState: () => state,
        async setState(next) {
          state = next;
          await wb.storage.set("state", state);
          await wb.composition.repaint();
        }
      });
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "letterbox",
      description: "Apply cinematic letterbox bars + optional vignette pulse to the composition.",
      parameters: {
        type: "object",
        properties: {
          ratio: { type: "string", enum: RATIOS.map((r) => r.id), description: "off / 239 / 220 / 185 / 43" },
          vignette_pct: { type: "number", minimum: 0, maximum: 100 },
          open_close_s: { type: "number", minimum: 0.2, maximum: 1.5 },
          pulse_on_beat: { type: "boolean" },
          enabled: { type: "boolean" }
        }
      }
    },
    async invoke({ ratio, vignette_pct, open_close_s, pulse_on_beat, enabled }) {
      const next = { ...state };
      if (ratio) {
        const r = findRatio(ratio);
        if (!r) throw new Error(`unknown ratio: ${ratio}`);
        next.ratioId = r.id;
        if (r.id !== "off") next.enabled = true;
      }
      if (typeof vignette_pct === "number") next.vignettePct = Math.max(0, Math.min(100, vignette_pct));
      if (typeof open_close_s === "number") next.openCloseS = Math.max(0.2, Math.min(1.5, open_close_s));
      if (typeof pulse_on_beat === "boolean") next.pulseOnBeat = pulse_on_beat;
      if (typeof enabled === "boolean") next.enabled = enabled;
      state = next;
      await wb.storage.set("state", state);
      panel?.onStateChange(state);
      await wb.composition.repaint();
      return JSON.stringify({ ok: true, state });
    }
  });
  if (state.enabled) {
    queueMicrotask(() => wb.composition.repaint());
  }
  wb.log(`letterbox activated (enabled=${state.enabled}, ratio=${state.ratioId})`);
}
export {
  manifest,
  onActivate
};
