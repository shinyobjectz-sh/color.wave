// panel — imperative-DOM panel mount. Mirrors palette-swap's idiom so
// plain-JS plugins don't need a Svelte build chain.
//
// Lifecycle: mount(root) → returns a cleanup function. The plugin
// SDK's `wb.panels.addTab` / `wb.timeline.addClipAction` call into
// this with a fresh root each open.

import { mountWaveform } from "./waveform.js";
import { mountBezier } from "./bezier.js";
import { PRESETS, findPreset, DEFAULT_PRESET_ID } from "./presets.js";
import { computeCuts, findSilences, totalKeptDuration } from "./policy.js";

export function mountPanel(root, deps) {
  const { wb, runTighten, getActiveCurve, setActiveCurve, getActivePresetId, setActivePresetId } = deps;

  root.innerHTML = `
    <div class="sc-wrap">
      <header class="sc-head">
        <div class="sc-title">silence-cutter</div>
        <div class="sc-meta">
          <span class="sc-state-label">clip</span>
          <span class="sc-clip-name">— pick a clip from the timeline —</span>
        </div>
      </header>

      <div class="sc-section">
        <canvas class="sc-waveform" aria-label="audio waveform"></canvas>
      </div>

      <div class="sc-row">
        <div class="sc-curve-col">
          <div class="sc-section-label">curve</div>
          <canvas class="sc-bezier" aria-label="bezier curve editor"></canvas>
          <div class="sc-presets"></div>
        </div>
        <div class="sc-stats-col">
          <div class="sc-section-label">stats</div>
          <dl class="sc-stats">
            <dt>silences</dt><dd class="sc-stat-silences">—</dd>
            <dt>cuts</dt><dd class="sc-stat-cuts">—</dd>
            <dt>original</dt><dd class="sc-stat-orig">—</dd>
            <dt>tightened</dt><dd class="sc-stat-out">—</dd>
            <dt>saved</dt><dd class="sc-stat-saved">—</dd>
          </dl>
          <button class="sc-tighten" disabled>Tighten</button>
          <div class="sc-status"></div>
        </div>
      </div>
    </div>
    <style>
      .sc-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .sc-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
      .sc-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .sc-meta { display: flex; gap: 6px; align-items: baseline; }
      .sc-state-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .sc-clip-name { color: var(--color-fg); }
      .sc-section { margin-bottom: 10px; }
      .sc-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .sc-waveform { width: 100%; height: 80px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; }
      .sc-row { display: grid; grid-template-columns: 1fr 180px; gap: 10px; }
      .sc-bezier { width: 100%; height: 160px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; cursor: crosshair; touch-action: none; }
      .sc-presets { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .sc-preset { background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; padding: 4px 8px; font-size: 10px; color: var(--color-fg-muted); cursor: pointer; }
      .sc-preset:hover { border-color: var(--color-fg-muted); }
      .sc-preset.active { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 10%, var(--color-page)); }
      .sc-stats { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 11px; margin: 0; }
      .sc-stats dt { color: var(--color-fg-faint); }
      .sc-stats dd { margin: 0; color: var(--color-fg); font-variant-numeric: tabular-nums; }
      .sc-tighten { margin-top: 10px; width: 100%; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .sc-tighten:disabled { opacity: 0.4; cursor: not-allowed; }
      .sc-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .sc-status.err { color: rgb(255, 120, 120); }
    </style>
  `;

  const waveCanvas = root.querySelector(".sc-waveform");
  const bezierCanvas = root.querySelector(".sc-bezier");
  const presetsEl = root.querySelector(".sc-presets");
  const tightenBtn = root.querySelector(".sc-tighten");
  const statusEl = root.querySelector(".sc-status");
  const clipNameEl = root.querySelector(".sc-clip-name");
  const stat = {
    silences: root.querySelector(".sc-stat-silences"),
    cuts: root.querySelector(".sc-stat-cuts"),
    orig: root.querySelector(".sc-stat-orig"),
    out: root.querySelector(".sc-stat-out"),
    saved: root.querySelector(".sc-stat-saved"),
  };

  const wave = mountWaveform(waveCanvas);

  let curve = getActiveCurve();
  let activePresetId = getActivePresetId();
  let words = null;
  let cuts = [];
  let originalDur = 0;
  let busy = false;

  const bezier = mountBezier(bezierCanvas, curve, ({ p1, p2 }) => {
    curve = { ...curve, p1, p2 };
    setActiveCurve(curve);
    activePresetId = null; // user shaped a custom curve
    setActivePresetId(null);
    refreshPresetUI();
    recomputeCuts();
  });

  function refreshPresetUI() {
    presetsEl.innerHTML = "";
    for (const p of PRESETS) {
      const b = document.createElement("button");
      b.className = "sc-preset";
      if (p.id === activePresetId) b.classList.add("active");
      b.textContent = p.label;
      b.title = p.description;
      b.addEventListener("click", () => {
        activePresetId = p.id;
        setActivePresetId(p.id);
        curve = {
          p1: { ...p.p1 },
          p2: { ...p.p2 },
          attackMaxMs: p.attackMaxMs,
          decayMaxMs: p.decayMaxMs,
          crossfadeMaxMs: p.crossfadeMaxMs,
        };
        setActiveCurve(curve);
        bezier.set(curve);
        refreshPresetUI();
        recomputeCuts();
      });
      presetsEl.appendChild(b);
    }
  }

  function recomputeCuts() {
    if (!words) return;
    cuts = computeCuts(words, curve);
    const silences = findSilences(words);
    wave.setSilences(silences);
    wave.setCuts(cuts);
    const tightened = totalKeptDuration(originalDur, cuts);
    stat.silences.textContent = String(silences.length);
    stat.cuts.textContent = String(cuts.length);
    stat.orig.textContent = fmtSec(originalDur);
    stat.out.textContent = fmtSec(tightened);
    stat.saved.textContent = fmtSec(originalDur - tightened);
    tightenBtn.disabled = busy || cuts.length === 0;
  }

  function setStatus(msg, isErr = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!isErr);
  }

  function setBusy(b) {
    busy = b;
    tightenBtn.disabled = b || cuts.length === 0;
  }

  tightenBtn.addEventListener("click", async () => {
    if (busy || !cuts.length) return;
    setBusy(true);
    setStatus("applying cuts…");
    try {
      await runTighten(cuts);
      setStatus(`tightened — dropped ${cuts.length} silences`);
    } catch (e) {
      setStatus(String(e?.message ?? e), true);
    } finally {
      setBusy(false);
    }
  });

  refreshPresetUI();

  return {
    setClip(clip) {
      clipNameEl.textContent = clip?.label ?? "(untitled clip)";
    },
    setAudio(buffer, sampleRate, durationS) {
      originalDur = durationS;
      wave.setBuffer(buffer, sampleRate);
      stat.orig.textContent = fmtSec(durationS);
    },
    setWords(w) {
      words = w;
      recomputeCuts();
    },
    setStatus,
    setBusy,
    destroy() {
      wave.destroy();
      bezier.destroy();
      root.innerHTML = "";
    },
  };
}

function fmtSec(s) {
  if (!isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(2);
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}
