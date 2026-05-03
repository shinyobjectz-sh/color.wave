// pathPanel — imperative panel showing the solved path as an SVG
// polyline through bbox centers, with a thumbnail strip beneath.
//
// v0.1: render-only (no drag-to-edit handles yet — that lands in v0.2
// when we wire user-edits into solver re-runs). Focus is showing the
// auto-solve was sane.

export function mountPathPanel(root, deps) {
  const { onSolve, onRatioChange, onModeChange } = deps;
  root.innerHTML = `
    <div class="sr-wrap">
      <header class="sr-head">
        <div class="sr-title">smart-reframe</div>
        <div class="sr-clip-name">— pick a clip from the timeline —</div>
      </header>

      <div class="sr-controls">
        <label>ratio
          <select class="sr-ratio">
            <option value="9:16">9:16 vertical</option>
            <option value="1:1">1:1 square</option>
            <option value="4:5">4:5 portrait</option>
            <option value="2.39:1">2.39:1 cinema</option>
            <option value="16:9">16:9 landscape</option>
          </select>
        </label>
        <label>subject
          <select class="sr-mode">
            <option value="person">Person</option>
            <option value="face">Face</option>
            <option value="largest-object">Largest object</option>
          </select>
        </label>
        <button class="sr-solve" disabled>Solve</button>
      </div>

      <div class="sr-section">
        <div class="sr-section-label">path</div>
        <svg class="sr-svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet"></svg>
      </div>

      <div class="sr-section">
        <div class="sr-section-label">thumbnails</div>
        <div class="sr-thumbs"></div>
      </div>

      <div class="sr-status"></div>
    </div>
    <style>
      .sr-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .sr-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .sr-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .sr-clip-name { color: var(--color-fg); }
      .sr-controls { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 10px; }
      .sr-controls label { display: flex; flex-direction: column; gap: 2px; color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .sr-controls select { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: 11px ui-monospace, monospace; }
      .sr-solve { align-self: end; padding: 6px 12px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .sr-solve:disabled { opacity: 0.4; cursor: not-allowed; }
      .sr-section { margin-bottom: 10px; }
      .sr-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .sr-svg { width: 100%; aspect-ratio: 16/9; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; display: block; }
      .sr-thumbs { display: flex; gap: 2px; overflow-x: auto; height: 48px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; padding: 2px; }
      .sr-thumbs canvas { height: 100%; width: auto; border-radius: 2px; flex-shrink: 0; }
      .sr-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .sr-status.err { color: rgb(255, 120, 120); }
    </style>
  `;

  const ratioSel = root.querySelector(".sr-ratio");
  const modeSel  = root.querySelector(".sr-mode");
  const solveBtn = root.querySelector(".sr-solve");
  const svg      = root.querySelector(".sr-svg");
  const thumbsEl = root.querySelector(".sr-thumbs");
  const statusEl = root.querySelector(".sr-status");
  const clipNameEl = root.querySelector(".sr-clip-name");

  ratioSel.addEventListener("change", () => onRatioChange?.(ratioSel.value));
  modeSel.addEventListener("change", () => onModeChange?.(modeSel.value));
  solveBtn.addEventListener("click", () => onSolve?.());

  function setStatus(msg, isErr = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", !!isErr);
  }

  function setSize(w, h) {
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }

  function renderPath(track, ratio, fw, fh) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ns = "http://www.w3.org/2000/svg";
    // Source frame border
    const border = document.createElementNS(ns, "rect");
    border.setAttribute("x", 0); border.setAttribute("y", 0);
    border.setAttribute("width", fw); border.setAttribute("height", fh);
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", "rgba(255,255,255,0.08)");
    border.setAttribute("stroke-width", 2);
    svg.appendChild(border);
    // Crop window centered through every keyframe
    const targetAspect = ratio.w / ratio.h;
    const srcAspect = fw / fh;
    let cropW, cropH;
    if (targetAspect <= srcAspect) { cropH = fh; cropW = fh * targetAspect; }
    else                            { cropW = fw; cropH = fw / targetAspect; }
    // Path of subject centers
    const pts = track.filter((t) => Number.isFinite(t.cx)).map((t) => `${t.cx},${t.cy}`).join(" ");
    const poly = document.createElementNS(ns, "polyline");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "rgb(0, 220, 255)");
    poly.setAttribute("stroke-width", 4);
    poly.setAttribute("stroke-linecap", "round");
    svg.appendChild(poly);
    // Crop window at first keyframe
    if (track.length) {
      const first = track[0];
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x", first.cx - cropW / 2);
      r.setAttribute("y", first.cy - cropH / 2);
      r.setAttribute("width", cropW);
      r.setAttribute("height", cropH);
      r.setAttribute("fill", "none");
      r.setAttribute("stroke", "rgba(0, 220, 255, 0.4)");
      r.setAttribute("stroke-dasharray", "8 6");
      r.setAttribute("stroke-width", 3);
      svg.appendChild(r);
    }
  }

  function renderThumbs(frames) {
    thumbsEl.innerHTML = "";
    for (const f of frames.slice(0, 16)) {
      const c = document.createElement("canvas");
      const ratio = f.width / f.height;
      c.height = 44; c.width = Math.round(44 * ratio);
      c.getContext("2d").drawImage(f.bitmap, 0, 0, c.width, c.height);
      thumbsEl.appendChild(c);
    }
  }

  return {
    setClip(label) { clipNameEl.textContent = label; solveBtn.disabled = false; },
    setRatio(id) { ratioSel.value = id; },
    setMode(id) { modeSel.value = id; },
    setSize,
    setStatus,
    setBusy(b) { solveBtn.disabled = b; },
    renderPath,
    renderThumbs,
    destroy() { root.innerHTML = ""; },
  };
}
