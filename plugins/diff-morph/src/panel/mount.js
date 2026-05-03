// panel — Diff Morph editor: BEFORE / AFTER textareas + controls.

const LANGS = ["typescript", "javascript", "python", "rust", "go", "json", "html", "css", "sql"];

export function mountDiffPanel(root, deps) {
  const { onInsert } = deps;

  root.innerHTML = `
    <div class="dm-wrap">
      <header class="dm-head">
        <div class="dm-title">diff-morph</div>
        <div class="dm-stats">— diff stats</div>
      </header>
      <div class="dm-section">
        <div class="dm-section-label">before</div>
        <textarea class="dm-before" placeholder="paste old code…" spellcheck="false"></textarea>
      </div>
      <div class="dm-section">
        <div class="dm-section-label">after</div>
        <textarea class="dm-after" placeholder="paste new code…" spellcheck="false"></textarea>
      </div>
      <div class="dm-controls">
        <label>language
          <select class="dm-lang">
            ${LANGS.map((l) => `<option value="${l}">${l}</option>`).join("")}
          </select>
        </label>
        <label>duration <span class="dm-dur-val">1.4s</span>
          <input class="dm-dur" type="range" min="0.5" max="4" step="0.1" value="1.4" />
        </label>
        <label>insert at <span class="dm-at-val">0.0s</span>
          <input class="dm-at" type="number" step="0.1" min="0" value="0" />
        </label>
      </div>
      <button class="dm-insert" disabled>Insert into timeline</button>
      <div class="dm-status"></div>
    </div>
    <style>
      .dm-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .dm-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .dm-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .dm-stats { color: var(--color-fg); font-variant-numeric: tabular-nums; }
      .dm-section { margin-bottom: 8px; }
      .dm-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .dm-before, .dm-after { width: 100%; height: 100px; padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); font: 11px ui-monospace, monospace; resize: vertical; }
      .dm-controls { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .dm-controls label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .dm-controls select, .dm-controls input { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: 11px ui-monospace, monospace; }
      .dm-insert { width: 100%; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .dm-insert:disabled { opacity: 0.4; cursor: not-allowed; }
      .dm-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .dm-status.err { color: rgb(255, 120, 120); }
    </style>
  `;

  const beforeEl = root.querySelector(".dm-before");
  const afterEl = root.querySelector(".dm-after");
  const langSel = root.querySelector(".dm-lang");
  const durInput = root.querySelector(".dm-dur");
  const durVal = root.querySelector(".dm-dur-val");
  const atInput = root.querySelector(".dm-at");
  const atVal = root.querySelector(".dm-at-val");
  const insertBtn = root.querySelector(".dm-insert");
  const statsEl = root.querySelector(".dm-stats");
  const statusEl = root.querySelector(".dm-status");

  function refreshState() {
    insertBtn.disabled = !beforeEl.value.trim() || !afterEl.value.trim();
  }

  beforeEl.addEventListener("input", refreshState);
  afterEl.addEventListener("input", refreshState);
  durInput.addEventListener("input", () => { durVal.textContent = `${durInput.value}s`; });
  atInput.addEventListener("input", () => { atVal.textContent = `${parseFloat(atInput.value).toFixed(1)}s`; });

  insertBtn.addEventListener("click", async () => {
    insertBtn.disabled = true;
    try {
      const stats = await onInsert?.({
        before: beforeEl.value,
        after: afterEl.value,
        language: langSel.value,
        durationS: parseFloat(durInput.value),
        insertAt: parseFloat(atInput.value),
      });
      if (stats) statsEl.textContent = `kept ${stats.kept} · ins ${stats.inserted} · del ${stats.removed}${stats.renamed ? ` · ren ${stats.renamed}` : ""}`;
      statusEl.textContent = "inserted";
      statusEl.classList.remove("err");
    } catch (e) {
      statusEl.textContent = String(e?.message ?? e);
      statusEl.classList.add("err");
    } finally {
      refreshState();
    }
  });

  refreshState();

  return {
    setBefore(v) { beforeEl.value = v; refreshState(); },
    setAfter(v) { afterEl.value = v; refreshState(); },
    setStatus(msg, err = false) { statusEl.textContent = msg; statusEl.classList.toggle("err", !!err); },
    destroy() { root.innerHTML = ""; },
  };
}
