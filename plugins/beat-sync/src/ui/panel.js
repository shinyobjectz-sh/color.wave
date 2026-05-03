// panel — Beat-sync panel: drop track, detect, snap, hit-effect picker.

import { mountBeatWaveform } from "./waveform.js";

export function mountBeatPanel(root, deps) {
  const { onTrackLoad, onDetect, onSnap, onClear, getState, setEffect } = deps;
  root.innerHTML = `
    <div class="bs-wrap">
      <header class="bs-head">
        <div class="bs-title">beat-sync</div>
        <div class="bs-meta">
          <span class="bs-bpm">— BPM</span>
        </div>
      </header>
      <div class="bs-drop">drop a track to detect beats</div>
      <canvas class="bs-wave" aria-label="track waveform with beat ticks"></canvas>
      <div class="bs-controls">
        <label>tolerance <span class="bs-tol-val">60ms</span>
          <input class="bs-tol" type="range" min="10" max="200" value="60" />
        </label>
        <label>hit effect
          <select class="bs-effect">
            <option value="flash">Flash</option>
            <option value="zoom">Zoom</option>
            <option value="shake">Shake</option>
            <option value="none">None</option>
          </select>
        </label>
      </div>
      <div class="bs-row">
        <button class="bs-detect" disabled>Detect</button>
        <button class="bs-snap" disabled>Snap clips</button>
        <button class="bs-clear" disabled>Clear</button>
      </div>
      <div class="bs-status"></div>
    </div>
    <style>
      .bs-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .bs-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .bs-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .bs-bpm { color: var(--color-fg); font-variant-numeric: tabular-nums; }
      .bs-drop { padding: 16px 8px; border: 1px dashed var(--color-border); border-radius: 6px; text-align: center; cursor: pointer; margin-bottom: 8px; color: var(--color-fg-muted); }
      .bs-drop.over { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 8%, var(--color-page)); }
      .bs-wave { width: 100%; height: 80px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; margin-bottom: 8px; }
      .bs-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .bs-controls label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; display: flex; flex-direction: column; gap: 3px; }
      .bs-controls input, .bs-controls select { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: 11px ui-monospace, monospace; }
      .bs-row { display: flex; gap: 6px; margin-bottom: 6px; }
      .bs-row button { flex: 1; padding: 6px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .bs-detect { background: var(--color-accent) !important; color: var(--color-accent-fg) !important; border-color: var(--color-accent) !important; font-weight: 600 !important; }
      .bs-row button:disabled { opacity: 0.4; cursor: not-allowed; }
      .bs-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .bs-status.err { color: rgb(255, 120, 120); }
    </style>
  `;

  const drop = root.querySelector(".bs-drop");
  const detectBtn = root.querySelector(".bs-detect");
  const snapBtn = root.querySelector(".bs-snap");
  const clearBtn = root.querySelector(".bs-clear");
  const tolInput = root.querySelector(".bs-tol");
  const tolVal = root.querySelector(".bs-tol-val");
  const effectSel = root.querySelector(".bs-effect");
  const statusEl = root.querySelector(".bs-status");
  const bpmEl = root.querySelector(".bs-bpm");
  const waveCanvas = root.querySelector(".bs-wave");
  const wave = mountBeatWaveform(waveCanvas);

  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file?.type.startsWith("audio/")) {
      setStatus("not an audio file", true);
      return;
    }
    await onTrackLoad?.(file);
  });
  drop.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "audio/*";
    input.addEventListener("change", () => {
      const f = input.files?.[0]; if (f) onTrackLoad?.(f);
    });
    input.click();
  });

  detectBtn.addEventListener("click", () => onDetect?.());
  snapBtn.addEventListener("click", () => onSnap?.(parseInt(tolInput.value, 10)));
  clearBtn.addEventListener("click", () => onClear?.());
  tolInput.addEventListener("input", () => { tolVal.textContent = `${tolInput.value}ms`; });
  effectSel.addEventListener("change", () => setEffect?.(effectSel.value));

  const s = getState?.();
  if (s?.effect) effectSel.value = s.effect;

  function setStatus(msg, err = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!err);
  }

  return {
    setStatus,
    setBuffer(pcm, rate) { wave.setBuffer(pcm, rate); detectBtn.disabled = false; clearBtn.disabled = false; },
    setBeats(beats, bpm) {
      wave.setBeats(beats);
      snapBtn.disabled = !beats.length;
      bpmEl.textContent = bpm ? `${bpm.toFixed(1)} BPM · ${beats.length} beats` : "— BPM";
    },
    setBusy(b) { detectBtn.disabled = b; snapBtn.disabled = b; clearBtn.disabled = b; },
    destroy() { wave.destroy(); root.innerHTML = ""; },
  };
}
