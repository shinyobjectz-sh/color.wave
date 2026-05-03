// settings — letterbox controls in the Settings modal.

import { RATIOS, DEFAULT_RATIO_ID } from "./presets.js";

const BAR_COLORS = [
  { id: "black",  label: "Black",  value: "#000" },
  { id: "graphite", label: "Graphite", value: "#0a0a0a" },
  { id: "ink",    label: "Ink",    value: "#101015" },
];

const EASINGS = [
  { id: "cinema", label: "Cinema",      value: "cubic-bezier(0.77,0,0.175,1)" },
  { id: "easeio", label: "Ease in/out", value: "ease-in-out" },
  { id: "linear", label: "Linear",      value: "linear" },
];

export function mountSettings(root, deps) {
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
      stateValEl.textContent = `on · ${r?.label ?? state.ratioId}`;
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
        refreshHeader(); refreshRatios();
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
      pulseOnBeat: pulseCb.checked,
    };
    vigVal.textContent = `${state.vignettePct}%`;
    durVal.textContent = `${state.openCloseS}s`;
    await setState(state);
  };
  for (const el of [colorSel, easeSel, vig, dur, animCb, pulseCb]) {
    el.addEventListener("input", persist);
    el.addEventListener("change", persist);
  }

  refreshHeader(); refreshRatios();

  return {
    onStateChange(s) {
      state = s;
      refreshHeader(); refreshRatios();
    },
    destroy() { root.innerHTML = ""; },
  };
}
