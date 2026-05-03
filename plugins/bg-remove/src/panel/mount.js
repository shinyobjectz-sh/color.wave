// panel — review masks for the active clip; offer fallback when low confidence.

export function mountBgPanel(root, deps) {
  const { onRun, onClear, onReplace } = deps;
  root.innerHTML = `
    <div class="bg-wrap">
      <header class="bg-head">
        <div class="bg-title">bg-remove</div>
        <div class="bg-clip">— pick a clip from the timeline —</div>
      </header>
      <div class="bg-row">
        <button class="bg-run" disabled>Remove background</button>
        <button class="bg-clear" disabled>Clear mask</button>
      </div>
      <div class="bg-preview-wrap">
        <div class="bg-section-label">preview</div>
        <div class="bg-preview"></div>
      </div>
      <div class="bg-fallback" hidden>
        <div class="bg-fb-msg">Mask looks soft — replace background instead?</div>
        <div class="bg-fb-row">
          <button class="bg-fb-color" data-color="#000">Black</button>
          <button class="bg-fb-color" data-color="#fff">White</button>
          <button class="bg-fb-color" data-color="#0e1116">Dark</button>
          <button class="bg-fb-color" data-color="#f5f5f7">Apple grey</button>
        </div>
      </div>
      <div class="bg-status"></div>
    </div>
    <style>
      .bg-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .bg-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .bg-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .bg-clip { color: var(--color-fg); }
      .bg-row { display: flex; gap: 6px; margin-bottom: 10px; }
      .bg-run { flex: 2; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .bg-clear { flex: 1; padding: 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; }
      .bg-run:disabled, .bg-clear:disabled { opacity: 0.4; cursor: not-allowed; }
      .bg-preview-wrap { margin-bottom: 10px; }
      .bg-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .bg-preview { aspect-ratio: 16/9; background: repeating-conic-gradient(#1a1a1a 0% 25%, #2a2a2a 0% 50%) 50% / 16px 16px; border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden; display: grid; place-items: center; }
      .bg-preview img { max-width: 100%; max-height: 100%; }
      .bg-fallback { padding: 8px; border: 1px solid rgb(255, 180, 80); background: color-mix(in srgb, rgb(255, 180, 80) 12%, var(--color-page)); border-radius: 4px; margin-bottom: 8px; }
      .bg-fb-msg { color: var(--color-fg); margin-bottom: 6px; font-size: 11px; }
      .bg-fb-row { display: flex; gap: 4px; flex-wrap: wrap; }
      .bg-fb-color { padding: 4px 10px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .bg-status { font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .bg-status.err { color: rgb(255, 120, 120); }
    </style>
  `;

  const runBtn = root.querySelector(".bg-run");
  const clearBtn = root.querySelector(".bg-clear");
  const previewEl = root.querySelector(".bg-preview");
  const statusEl = root.querySelector(".bg-status");
  const clipEl = root.querySelector(".bg-clip");
  const fbEl = root.querySelector(".bg-fallback");

  runBtn.addEventListener("click", () => onRun?.());
  clearBtn.addEventListener("click", () => onClear?.());
  fbEl.querySelectorAll(".bg-fb-color").forEach((b) => {
    b.addEventListener("click", () => onReplace?.(b.dataset.color));
  });

  return {
    setClip(label, hasMask) {
      clipEl.textContent = label;
      runBtn.disabled = false;
      clearBtn.disabled = !hasMask;
    },
    setStatus(msg, err = false) { statusEl.textContent = msg; statusEl.classList.toggle("err", !!err); },
    setBusy(b) { runBtn.disabled = b; clearBtn.disabled = b; },
    setPreviewDataUrl(dataUrl) {
      previewEl.innerHTML = "";
      if (!dataUrl) return;
      const img = document.createElement("img");
      img.src = dataUrl;
      previewEl.appendChild(img);
    },
    showFallback(show) { fbEl.hidden = !show; },
    destroy() { root.innerHTML = ""; },
  };
}
