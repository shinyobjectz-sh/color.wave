// src/presets.js
var PRESETS = [
  {
    id: "neutral",
    label: "Neutral",
    description: "No grade. Bypass the filter, restore the truth.",
    filter: "none",
    swatches: ["#1a1a1a", "#888", "#eee"]
  },
  {
    id: "kodak-2383",
    label: "Kodak 2383",
    description: "Warm shadows, peach highlights \u2014 classic film print.",
    filter: "brightness(1.04) contrast(1.12) saturate(0.95) sepia(0.10) hue-rotate(-8deg)",
    swatches: ["#3b2a1a", "#c89868", "#f6e4c2"]
  },
  {
    id: "fuji-3510",
    label: "Fuji 3510",
    description: "Cool greens, restrained reds \u2014 Wong Kar-wai-ish.",
    filter: "brightness(1.02) contrast(1.08) saturate(0.92) hue-rotate(6deg)",
    swatches: ["#1c2a26", "#7a9a8d", "#e7eee8"]
  },
  {
    id: "polaroid-600",
    label: "Polaroid 600",
    description: "Warm casts, soft contrast, slight green shadows.",
    filter: "brightness(1.06) contrast(0.96) saturate(0.85) sepia(0.18) hue-rotate(-15deg)",
    swatches: ["#2a261c", "#d2b08e", "#f8eed5"]
  },
  {
    id: "teal-orange",
    label: "Teal & Orange",
    description: "The Hollywood blockbuster grade. Pushes complementaries.",
    filter: "brightness(1.0) contrast(1.18) saturate(1.25) hue-rotate(-4deg)",
    swatches: ["#0e2535", "#d28560", "#fff7ed"]
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description: "Magenta highlights, cyan shadows, crushed contrast.",
    filter: "brightness(0.92) contrast(1.30) saturate(1.40) hue-rotate(-22deg)",
    swatches: ["#0a1226", "#a64bff", "#13e6ef"]
  },
  {
    id: "bleach-bypass",
    label: "Bleach Bypass",
    description: "Skipped silver retain \u2014 desaturated with crushed blacks.",
    filter: "brightness(1.0) contrast(1.40) saturate(0.30)",
    swatches: ["#0a0a0a", "#7e7e7e", "#f0f0f0"]
  },
  {
    id: "cross-process",
    label: "Cross-process",
    description: "C-41 in E-6 chemistry. Yellows pop, blues crush.",
    filter: "brightness(1.05) contrast(1.20) saturate(1.40) hue-rotate(20deg) sepia(0.05)",
    swatches: ["#15280f", "#d4be4a", "#f1f8c0"]
  }
];
function findPreset(id) {
  return PRESETS.find((p) => p.id === id) ?? null;
}
var DEFAULT_PRESET_ID = "neutral";

// src/match.js
var SAMPLE_DIM = 128;
async function matchReference(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(SAMPLE_DIM, SAMPLE_DIM);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, SAMPLE_DIM, SAMPLE_DIM);
  const data = ctx.getImageData(0, 0, SAMPLE_DIM, SAMPLE_DIM).data;
  const stats = computeStats(data);
  return statsToFilter(stats);
}
function computeStats(data) {
  let sumR = 0, sumG = 0, sumB = 0;
  let sumR2 = 0, sumG2 = 0, sumB2 = 0;
  let sumLum = 0;
  let n = 0;
  const hueBins = new Float32Array(24);
  let totalSat = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    sumR += r;
    sumG += g;
    sumB += b;
    sumR2 += r * r;
    sumG2 += g * g;
    sumB2 += b * b;
    sumLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max, d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = (g - b) / d % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const bin = Math.floor(h / 360 * 24) % 24;
    hueBins[bin] += s;
    totalSat += s;
    n++;
  }
  const meanR = sumR / n, meanG = sumG / n, meanB = sumB / n;
  const varR = sumR2 / n - meanR * meanR;
  const varG = sumG2 / n - meanG * meanG;
  const varB = sumB2 / n - meanB * meanB;
  const meanLum = sumLum / n;
  const meanVar = (varR + varG + varB) / 3;
  const meanSat = totalSat / n;
  let sx = 0, sy = 0;
  for (let i = 0; i < 24; i++) {
    const ang = i / 24 * Math.PI * 2;
    sx += hueBins[i] * Math.cos(ang);
    sy += hueBins[i] * Math.sin(ang);
  }
  const hueCentroid = Math.atan2(sy, sx) * 180 / Math.PI;
  return { meanR, meanG, meanB, meanLum, meanVar, meanSat, hueCentroid };
}
function statsToFilter({ meanLum, meanVar, meanSat, meanR, meanB, hueCentroid }) {
  const brightness = clamp(0.5 + (meanLum - 0.5) * 0.6, 0.85, 1.2).toFixed(3);
  const baseVar = 1 / 12;
  const contrast = clamp(Math.sqrt((meanVar + 1e-3) / (baseVar + 1e-3)), 0.8, 1.45).toFixed(3);
  const saturate = clamp(meanSat / 0.3, 0.5, 1.6).toFixed(3);
  const baselineHue = 30;
  let hueDelta = hueCentroid - baselineHue;
  if (hueDelta > 180) hueDelta -= 360;
  if (hueDelta < -180) hueDelta += 360;
  const hueRotate = clamp(hueDelta * 0.5, -45, 45).toFixed(1);
  const warmth = clamp((meanR - meanB) * 0.6, 0, 0.3).toFixed(3);
  const sepia = parseFloat(warmth);
  const parts = [
    `brightness(${brightness})`,
    `contrast(${contrast})`,
    `saturate(${saturate})`
  ];
  if (Math.abs(parseFloat(hueRotate)) > 1) parts.push(`hue-rotate(${hueRotate}deg)`);
  if (sepia > 0.02) parts.push(`sepia(${sepia.toFixed(3)})`);
  return parts.join(" ");
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// src/curves.js
var HANDLE_R = 7;
function mountCurves(canvas, initial, onChange) {
  const ctx = canvas.getContext("2d");
  let p1 = { ...initial.p1 };
  let p2 = { ...initial.p2 };
  let drag = null;
  const dpr = window.devicePixelRatio || 1;
  function size() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }
  size();
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  function w() {
    return canvas.width;
  }
  function h() {
    return canvas.height;
  }
  function toPx(p) {
    return [p.x * w(), (1 - p.y) * h()];
  }
  function toNorm(px, py) {
    return { x: clamp01(px / w()), y: clamp01(1 - py / h()) };
  }
  function draw() {
    ctx.clearRect(0, 0, w(), h());
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, h());
    ctx.lineTo(w(), 0);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 1; i < 4; i++) {
      const x = i / 4 * w(), y = i / 4 * h();
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h());
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w(), y);
      ctx.stroke();
    }
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    ctx.strokeStyle = "rgb(0, 220, 255)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, h());
    ctx.bezierCurveTo(p1x, p1y, p2x, p2y, w(), 0);
    ctx.stroke();
    drawPt(p1x, p1y, drag === "p1");
    drawPt(p2x, p2y, drag === "p2");
  }
  function drawPt(x, y, active) {
    ctx.fillStyle = active ? "rgb(0, 220, 255)" : "#fff";
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  function pickHandle(px, py) {
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    const r = HANDLE_R * dpr * 1.8;
    if (Math.hypot(px - p1x, py - p1y) < r) return "p1";
    if (Math.hypot(px - p2x, py - p2y) < r) return "p2";
    return null;
  }
  function localPx(ev) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr];
  }
  function onDown(ev) {
    const [px, py] = localPx(ev);
    drag = pickHandle(px, py);
    if (drag) ev.preventDefault();
    draw();
  }
  function onMove(ev) {
    if (!drag) return;
    const [px, py] = localPx(ev);
    const n = toNorm(px, py);
    if (drag === "p1") p1 = n;
    else p2 = n;
    onChange?.({ p1, p2 });
    draw();
  }
  function onUp() {
    if (!drag) return;
    drag = null;
    draw();
  }
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  return {
    set(curve) {
      p1 = { ...curve.p1 };
      p2 = { ...curve.p2 };
      draw();
    },
    get() {
      return { p1: { ...p1 }, p2: { ...p2 } };
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      ro.disconnect();
    }
  };
}
function curveToAdj(curve) {
  const yMid = bezierY(curve, 0.5);
  const yLo = bezierY(curve, 0.25);
  const yHi = bezierY(curve, 0.75);
  const brightness = 1 + (yMid - 0.5) * 0.4;
  const contrast = 1 + (yHi - yLo - 0.5) * 0.6;
  return { brightness, contrast };
}
function bezierY(curve, t) {
  const u = 1 - t;
  return 3 * u * u * t * curve.p1.y + 3 * u * t * t * curve.p2.y + t * t * t;
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// src/decorator.js
function buildFilterChain({ baseFilter, curve, strengthPct }) {
  if (!baseFilter || baseFilter === "none") {
    if (!curve) return "none";
  }
  const s = Math.max(0, Math.min(1, strengthPct / 100));
  if (s === 0) return "none";
  let parts = parseFilter(baseFilter || "");
  if (curve) {
    const { brightness, contrast } = curveToAdj(curve);
    parts.push({ fn: "brightness", v: brightness });
    parts.push({ fn: "contrast", v: contrast });
  }
  parts = parts.map((p) => ({ fn: p.fn, v: blendTowardIdentity(p.fn, p.v, s) }));
  parts = coalesce(parts);
  return parts.map((p) => stringifyPart(p)).join(" ") || "none";
}
function parseFilter(s) {
  const out = [];
  if (!s || s === "none") return out;
  const re = /([a-z-]+)\(([^)]+)\)/gi;
  let m;
  while (m = re.exec(s)) {
    const fn = m[1].toLowerCase();
    const raw = m[2].trim();
    let v;
    if (raw.endsWith("deg")) v = parseFloat(raw);
    else if (raw.endsWith("%")) v = parseFloat(raw) / 100;
    else v = parseFloat(raw);
    if (Number.isFinite(v)) out.push({ fn, v });
  }
  return out;
}
function blendTowardIdentity(fn, v, s) {
  const id = identityFor(fn);
  return id + (v - id) * s;
}
function identityFor(fn) {
  switch (fn) {
    case "brightness":
      return 1;
    case "contrast":
      return 1;
    case "saturate":
      return 1;
    case "grayscale":
      return 0;
    case "sepia":
      return 0;
    case "invert":
      return 0;
    case "hue-rotate":
      return 0;
    case "blur":
      return 0;
    default:
      return 0;
  }
}
function coalesce(parts) {
  const map = /* @__PURE__ */ new Map();
  for (const p of parts) {
    if (!map.has(p.fn)) {
      map.set(p.fn, p.v);
      continue;
    }
    const prev = map.get(p.fn);
    if (p.fn === "hue-rotate") map.set(p.fn, prev + p.v);
    else map.set(p.fn, prev * p.v / identityFor(p.fn || "brightness"));
  }
  const out = [];
  for (const [fn, v] of map) {
    const id = identityFor(fn);
    if (Math.abs(v - id) < 1e-3) continue;
    out.push({ fn, v });
  }
  return out;
}
function stringifyPart({ fn, v }) {
  if (fn === "hue-rotate") return `hue-rotate(${v.toFixed(1)}deg)`;
  if (fn === "blur") return `blur(${v.toFixed(2)}px)`;
  return `${fn}(${v.toFixed(3)})`;
}
function decorate(html, state) {
  if (!state || !state.enabled) return html;
  const chain = buildFilterChain(state);
  if (!chain || chain === "none") return html;
  const block = `<style data-colorgrade="css">:root { --cg-filter: ${chain}; } body { filter: var(--cg-filter); }</style>`;
  return html + "\n" + block;
}

// src/panel/mount.js
function mountSettings(root, deps) {
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
        <div class="cg-drop">drop an image to match its grade \xB7 or paste</div>
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
    if (!state.enabled) {
      stateEl.textContent = "off";
      return;
    }
    if (state.sourceKind === "preset") {
      const p = PRESETS.find((x) => x.id === state.presetId);
      stateEl.textContent = `on \xB7 ${p?.label ?? state.presetId}`;
    } else if (state.sourceKind === "match") {
      stateEl.textContent = `on \xB7 matched (${state.matchName ?? "ref"})`;
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
          matchName: null
        };
        await setState(state);
        refreshHeader();
        refreshPresets();
      });
      presetsEl.appendChild(card);
    }
  }
  toggleBtn.addEventListener("click", async () => {
    state = { ...state, enabled: !state.enabled };
    await setState(state);
    refreshHeader();
  });
  ["dragenter", "dragover"].forEach((ev) => dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.add("over");
  }));
  ["dragleave", "drop"].forEach((ev) => dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.remove("over");
  }));
  dropEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    await handleMatch(file);
  });
  dropEl.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (f) handleMatch(f);
    });
    input.click();
  });
  window.addEventListener("paste", (e) => {
    if (!root.isConnected) return;
    const item = [...e.clipboardData?.items ?? []].find((it) => it.type.startsWith("image/"));
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
        presetId: null
      };
      await setState(state);
      refreshHeader();
      refreshPresets();
    } catch (e) {
      console.warn("colorgrade match failed", e);
    }
  }
  strength.value = String(state.strength ?? 100);
  strengthVal.textContent = `${strength.value}%`;
  strength.addEventListener("input", async () => {
    strengthVal.textContent = `${strength.value}%`;
    state = { ...state, strength: parseInt(strength.value, 10) };
    await setState(state);
  });
  curveCtl = mountCurves(curveCanvas, state.curve ?? { p1: { x: 0.25, y: 0.25 }, p2: { x: 0.75, y: 0.75 } }, async (c) => {
    state = { ...state, curve: c };
    await setState(state);
  });
  refreshHeader();
  refreshPresets();
  return {
    onStateChange(s) {
      state = s;
      refreshHeader();
      refreshPresets();
      if (curveCtl && s.curve) curveCtl.set(s.curve);
      strength.value = String(s.strength ?? 100);
      strengthVal.textContent = `${strength.value}%`;
    },
    destroy() {
      curveCtl?.destroy();
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "colorgrade",
  name: "Colorgrade",
  version: "0.1.0",
  description: "Reference-image grade match + curves panel. Grades the whole composition surface, not just video tracks.",
  icon: "\u{1F39A}",
  surfaces: ["composition-decorators", "settings", "agent-tools"],
  permissions: []
};
var DEFAULT_STATE = {
  enabled: false,
  sourceKind: "preset",
  presetId: DEFAULT_PRESET_ID,
  baseFilter: findPreset(DEFAULT_PRESET_ID).filter,
  matchName: null,
  curve: { p1: { x: 0.25, y: 0.25 }, p2: { x: 0.75, y: 0.75 } },
  // identity-ish
  strength: 100
};
async function onActivate(wb) {
  let state = wb.storage.get("state") ?? { ...DEFAULT_STATE };
  let panel = null;
  wb.composition.addRenderDecorator({
    priority: 200,
    // run after palette-swap (100) so palette colors get graded too
    transform(html) {
      return decorate(html, state);
    }
  });
  wb.settings.addSection({
    label: "Color Grade",
    mount(root) {
      panel = mountSettings(root, {
        getState: () => state,
        async setState(next) {
          state = next;
          await wb.storage.set("state", state);
          await wb.composition.repaint();
        },
        async onMatchImage(file) {
          return await matchReference(file);
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
      name: "color_grade",
      description: "Apply a color grade to the entire composition. Pick a built-in preset or pass a CSS filter chain directly.",
      parameters: {
        type: "object",
        properties: {
          preset: { type: "string", enum: PRESETS.map((p) => p.id) },
          filter: { type: "string", description: "Custom CSS filter chain (e.g. 'brightness(1.1) contrast(1.05) hue-rotate(-6deg)'). Ignored if preset is set." },
          strength: { type: "number", minimum: 0, maximum: 100 },
          enabled: { type: "boolean" }
        }
      }
    },
    async invoke({ preset, filter, strength, enabled }) {
      const next = { ...state };
      if (typeof enabled === "boolean") next.enabled = enabled;
      if (preset) {
        const p = findPreset(preset);
        if (!p) throw new Error(`unknown preset: ${preset}`);
        next.sourceKind = "preset";
        next.presetId = p.id;
        next.baseFilter = p.filter;
        next.matchName = null;
        next.enabled = true;
      } else if (typeof filter === "string") {
        next.sourceKind = "custom";
        next.baseFilter = filter;
        next.presetId = null;
        next.matchName = "custom";
        next.enabled = true;
      }
      if (typeof strength === "number") next.strength = Math.max(0, Math.min(100, strength));
      state = next;
      await wb.storage.set("state", state);
      panel?.onStateChange(state);
      await wb.composition.repaint();
      return JSON.stringify({
        ok: true,
        state: { enabled: state.enabled, sourceKind: state.sourceKind, baseFilter: state.baseFilter, strength: state.strength },
        chain: buildFilterChain(state)
      });
    }
  });
  if (state.enabled) {
    queueMicrotask(() => wb.composition.repaint());
  }
  wb.log(`colorgrade activated (enabled=${state.enabled}, source=${state.sourceKind})`);
}
export {
  manifest,
  onActivate
};
