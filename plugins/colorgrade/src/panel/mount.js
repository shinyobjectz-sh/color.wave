// settings panel — drop zone + presets + curve + strength + master toggle.

import { PRESETS } from "../presets.js";
import { mountCurves } from "../curves.js";

export function mountSettings(root, deps) {
  const { getState, setState, onMatchImage } = deps;

  root.innerHTML = `
    <div class="cg-wrap">
      <header class="cg-head">
        <div class="cg-meta">
          <span class="cg-label">grade</span>
          <span class="cg-state-val">off</span>
        </div>
        <button class="cg-toggle" type="button" role="switch" aria-checked="false" title="Toggle color grade override">
          <span class="cg-toggle-track"><span class="cg-toggle-knob"></span></span>
        </button>
      </header>

      <div class="cg-section">
        <div class="cg-section-label">reference / preset</div>
        <div class="cg-drop">drop an image to match its grade · or paste</div>
        <div class="cg-presets"></div>
      </div>

      <div class="cg-section">
        <div class="cg-section-label">master curve</div>
        <canvas class="cg-curve" aria-label="master tone curve"></canvas>
      </div>

      <div class="cg-section">
        <div class="cg-section-label">strength <span class="cg-strength-val">100%</span></div>
        <input class="cg-strength" type="range" min="0" max="100" value="100" />
      </div>
    </div>
    <style>
      .cg-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); }
      .cg-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding: 8px 10px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 6px; }
      .cg-meta { display: inline-flex; gap: 8px; align-items: baseline; }
      .cg-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .cg-state-val { color: var(--color-fg); font-weight: 600; }
      .cg-toggle { background: transparent; border: 0; padding: 0; cursor: pointer; }
      .cg-toggle-track { position: relative; display: inline-block; width: 30px; height: 16px; background: var(--color-border); border-radius: 999px; transition: background 120ms ease; }
      .cg-toggle-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; background: var(--color-fg-muted); border-radius: 999px; transition: transform 120ms ease, background 120ms ease; }
      .cg-toggle[aria-checked="true"] .cg-toggle-track { background: var(--color-accent); }
      .cg-toggle[aria-checked="true"] .cg-toggle-knob { background: var(--color-accent-fg); transform: translateX(14px); }
      .cg-section { margin-bottom: 10px; }
      .cg-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; display: flex; justify-content: space-between; }
      .cg-drop { padding: 16px 8px; border: 1px dashed var(--color-border); border-radius: 6px; text-align: center; cursor: pointer; color: var(--color-fg-muted); }
      .cg-drop.over { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 8%, var(--color-page)); }
      .cg-presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px; margin-top: 6px; }
      .cg-preset { display: flex; flex-direction: column; gap: 4px; padding: 6px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; }
      .cg-preset:hover { border-color: var(--color-fg-muted); }
      .cg-preset.active { border-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 10%, var(--color-page)); }
      .cg-preset-name { color: var(--color-fg); font-weight: 600; font-size: 10px; }
      .cg-preset-swatches { display: flex; gap: 2px; height: 14px; }
      .cg-preset-swatches > div { flex: 1; border-radius: 2px; }
      .cg-curve { width: 100%; height: 140px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; touch-action: none; }
      .cg-strength { width: 100%; }
    </style>
  `;

  const stateEl = root.querySelector(".cg-state-val");
  const toggleBtn = root.querySelector(".cg-toggle");
  const dropEl = root.querySelector(".cg-drop");
  const presetsEl = root.querySelector(".cg-presets");
  const curveCanvas = root.querySelector(".cg-curve");
  const strength = root.querySelector(".cg-strength");
  const strengthVal = root.querySelector(".cg-strength-val");

  let state = getState();
  let curveCtl = null;

  function refreshHeader() {
    toggleBtn.setAttribute("aria-checked", state.enabled ? "true" : "false");
    if (!state.enabled) { stateEl.textContent = "off"; return; }
    if (state.sourceKind === "preset") {
      const p = PRESETS.find((x) => x.id === state.presetId);
      stateEl.textContent = `on · ${p?.label ?? state.presetId}`;
    } else if (state.sourceKind === "match") {
      stateEl.textContent = `on · matched (${state.matchName ?? "ref"})`;
    } else {
      stateEl.textContent = "on";
    }
  }

  function refreshPresets() {
    presetsEl.innerHTML = "";
    for (const p of PRESETS) {
      const card = document.createElement("button");
      card.className = "cg-preset";
      if (state.sourceKind === "preset" && state.presetId === p.id) card.classList.add("active");
      card.innerHTML = `
        <div class="cg-preset-name">${p.label}</div>
        <div class="cg-preset-swatches">${p.swatches.map((c) => `<div style="background:${c}"></div>`).join("")}</div>
      `;
      card.addEventListener("click", async () => {
        state = {
          ...state,
          enabled: true,
          sourceKind: "preset",
          presetId: p.id,
          baseFilter: p.filter,
          matchName: null,
        };
        await setState(state);
        refreshHeader(); refreshPresets();
      });
      presetsEl.appendChild(card);
    }
  }

  toggleBtn.addEventListener("click", async () => {
    state = { ...state, enabled: !state.enabled };
    await setState(state);
    refreshHeader();
  });

  // Drag + drop + paste
  ["dragenter", "dragover"].forEach((ev) =>
    dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.remove("over"); }));
  dropEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    await handleMatch(file);
  });
  dropEl.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.addEventListener("change", () => {
      const f = input.files?.[0]; if (f) handleMatch(f);
    });
    input.click();
  });
  window.addEventListener("paste", (e) => {
    if (!root.isConnected) return;
    const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith("image/"));
    if (!item) return;
    const f = item.getAsFile();
    if (f) handleMatch(f);
  });

  async function handleMatch(file) {
    try {
      const fitted = await onMatchImage(file);
      state = {
        ...state,
        enabled: true,
        sourceKind: "match",
        baseFilter: fitted,
        matchName: file.name || "ref",
        presetId: null,
      };
      await setState(state);
      refreshHeader(); refreshPresets();
    } catch (e) {
      console.warn("colorgrade match failed", e);
    }
  }

  // Strength
  strength.value = String(state.strength ?? 100);
  strengthVal.textContent = `${strength.value}%`;
  strength.addEventListener("input", async () => {
    strengthVal.textContent = `${strength.value}%`;
    state = { ...state, strength: parseInt(strength.value, 10) };
    await setState(state);
  });

  // Curve
  curveCtl = mountCurves(curveCanvas, state.curve ?? { p1: { x: 0.25, y: 0.25 }, p2: { x: 0.75, y: 0.75 } }, async (c) => {
    state = { ...state, curve: c };
    await setState(state);
  });

  refreshHeader(); refreshPresets();

  return {
    onStateChange(s) {
      state = s;
      refreshHeader(); refreshPresets();
      if (curveCtl && s.curve) curveCtl.set(s.curve);
      strength.value = String(s.strength ?? 100);
      strengthVal.textContent = `${strength.value}%`;
    },
    destroy() {
      curveCtl?.destroy();
      root.innerHTML = "";
    },
  };
}
