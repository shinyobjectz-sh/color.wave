// panel — Captions panel: pack picker, transcript word grid, regen button.

import { PACKS } from "../packs/index.js";

export function mountCaptionsPanel(root, deps) {
  const { onPackChange, onWordEdit, onRegenerate, getActivePackId } = deps;

  root.innerHTML = `
    <div class="ac-wrap">
      <header class="ac-head">
        <div class="ac-title">auto-captions</div>
        <div class="ac-clip">— pick a clip from the timeline —</div>
      </header>
      <div class="ac-row">
        <div class="ac-section-label">style pack</div>
        <div class="ac-packs"></div>
      </div>
      <div class="ac-row">
        <div class="ac-section-label">transcript</div>
        <div class="ac-words"></div>
      </div>
      <button class="ac-regen" disabled>Re-transcribe</button>
      <div class="ac-status"></div>
    </div>
    <style>
      .ac-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .ac-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .ac-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .ac-clip { color: var(--color-fg); }
      .ac-row { margin-bottom: 10px; }
      .ac-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .ac-packs { display: flex; flex-wrap: wrap; gap: 4px; }
      .ac-pack { padding: 6px 10px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg-muted); cursor: pointer; font: inherit; }
      .ac-pack:hover { border-color: var(--color-fg-muted); }
      .ac-pack.active { border-color: var(--color-accent); color: var(--color-fg); background: color-mix(in srgb, var(--color-accent) 10%, var(--color-page)); }
      .ac-words { display: flex; flex-wrap: wrap; gap: 3px; max-height: 220px; overflow-y: auto; padding: 6px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; }
      .ac-word { padding: 2px 6px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 3px; font-size: 11px; color: var(--color-fg); cursor: text; outline: none; }
      .ac-word.popped { background: color-mix(in srgb, var(--color-accent) 25%, transparent); border-color: var(--color-accent); font-weight: 600; }
      .ac-word[contenteditable]:focus { border-color: var(--color-accent); }
      .ac-regen { width: 100%; padding: 6px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); cursor: pointer; font: inherit; }
      .ac-regen:disabled { opacity: 0.4; cursor: not-allowed; }
      .ac-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .ac-status.err { color: rgb(255, 120, 120); }
    </style>
  `;

  const packsEl = root.querySelector(".ac-packs");
  const wordsEl = root.querySelector(".ac-words");
  const regenBtn = root.querySelector(".ac-regen");
  const statusEl = root.querySelector(".ac-status");
  const clipEl = root.querySelector(".ac-clip");

  let activePackId = getActivePackId();
  let words = [];
  let popThreshold = 0.6;

  function renderPacks() {
    packsEl.innerHTML = "";
    for (const p of PACKS) {
      const b = document.createElement("button");
      b.className = "ac-pack";
      if (p.id === activePackId) b.classList.add("active");
      b.textContent = p.label;
      b.addEventListener("click", () => {
        activePackId = p.id;
        popThreshold = p.popThreshold;
        renderPacks();
        renderWords();
        onPackChange?.(p.id);
      });
      packsEl.appendChild(b);
    }
  }

  function renderWords() {
    wordsEl.innerHTML = "";
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const span = document.createElement("span");
      span.className = "ac-word";
      if ((w.rms ?? 0) >= popThreshold) span.classList.add("popped");
      span.textContent = w.w;
      span.contentEditable = "true";
      span.spellcheck = false;
      span.addEventListener("blur", () => {
        const next = span.textContent.trim();
        if (next && next !== w.w) onWordEdit?.(i, next);
      });
      wordsEl.appendChild(span);
    }
  }

  regenBtn.addEventListener("click", () => onRegenerate?.());

  renderPacks();

  return {
    setClipLabel(label) { clipEl.textContent = label; regenBtn.disabled = false; },
    setWords(w, threshold) { words = w; popThreshold = threshold ?? popThreshold; renderWords(); },
    setPack(id) { activePackId = id; const p = PACKS.find((x) => x.id === id); if (p) popThreshold = p.popThreshold; renderPacks(); renderWords(); },
    setStatus(msg, err = false) { statusEl.textContent = msg; statusEl.classList.toggle("err", !!err); },
    setBusy(b) { regenBtn.disabled = b; },
    destroy() { root.innerHTML = ""; },
  };
}
