// panel — Code Clip editor: source textarea, theme/lang/cursor pickers,
// duration + speed preset, Insert button. Defaults persist via wb.storage.

import { THEMES } from "../themes.js";
import { SPEED_PRESETS } from "../schedule.js";

const LANGS = ["typescript", "javascript", "python", "rust", "go", "json", "html", "css", "sql"];

export function mountCodePanel(root, deps) {
  const { onInsert, getDefaults, setDefaults } = deps;

  root.innerHTML = `
    <div class="cc-wrap">
      <header class="cc-head">
        <div class="cc-title">code-clip</div>
        <div class="cc-stat"></div>
      </header>
      <div class="cc-section">
        <div class="cc-section-label">source</div>
        <textarea class="cc-source" spellcheck="false" placeholder="paste code or click + Code in the chat input"></textarea>
      </div>
      <div class="cc-controls">
        <label>language
          <select class="cc-lang">${LANGS.map((l) => `<option value="${l}">${l}</option>`).join("")}</select>
        </label>
        <label>theme
          <select class="cc-theme">${THEMES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("")}</select>
        </label>
        <label>cursor
          <select class="cc-cursor">
            <option value="block">Block</option>
            <option value="beam">Beam</option>
            <option value="underscore">Underscore</option>
          </select>
        </label>
        <label>speed
          <select class="cc-speed">${SPEED_PRESETS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select>
        </label>
        <label>duration <span class="cc-dur-val">8s</span>
          <input class="cc-dur" type="range" min="2" max="30" step="0.5" value="8" />
        </label>
        <label>insert at <span class="cc-at-val">0.0s</span>
          <input class="cc-at" type="number" step="0.1" min="0" value="0" />
        </label>
      </div>
      <button class="cc-insert" disabled>Insert into timeline</button>
      <div class="cc-status"></div>
    </div>
    <style>
      .cc-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); padding: 10px; }
      .cc-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
      .cc-title { color: var(--color-fg); font-weight: 600; font-size: 12px; }
      .cc-stat { color: var(--color-fg); font-variant-numeric: tabular-nums; }
      .cc-section { margin-bottom: 8px; }
      .cc-section-label { color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .cc-source { width: 100%; height: 160px; padding: 8px; background: var(--color-page); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-fg); font: 11px ui-monospace, monospace; resize: vertical; }
      .cc-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .cc-controls label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg-faint); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }
      .cc-controls select, .cc-controls input { padding: 4px 6px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: 11px ui-monospace, monospace; }
      .cc-insert { width: 100%; padding: 8px; background: var(--color-accent); color: var(--color-accent-fg); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
      .cc-insert:disabled { opacity: 0.4; cursor: not-allowed; }
      .cc-status { margin-top: 6px; font-size: 10px; color: var(--color-fg-muted); min-height: 14px; }
      .cc-status.err { color: rgb(255, 120, 120); }
    </style>
  `;

  const sourceEl = root.querySelector(".cc-source");
  const langSel = root.querySelector(".cc-lang");
  const themeSel = root.querySelector(".cc-theme");
  const cursorSel = root.querySelector(".cc-cursor");
  const speedSel = root.querySelector(".cc-speed");
  const durInput = root.querySelector(".cc-dur");
  const durVal = root.querySelector(".cc-dur-val");
  const atInput = root.querySelector(".cc-at");
  const atVal = root.querySelector(".cc-at-val");
  const insertBtn = root.querySelector(".cc-insert");
  const statusEl = root.querySelector(".cc-status");
  const statEl = root.querySelector(".cc-stat");

  const d = getDefaults();
  langSel.value = d.language;
  themeSel.value = d.theme;
  cursorSel.value = d.cursor;
  speedSel.value = d.speed;
  durInput.value = String(d.durationS);
  durVal.textContent = `${d.durationS}s`;

  function refresh() { insertBtn.disabled = !sourceEl.value.trim(); }
  function persistDefaults() {
    setDefaults({
      language: langSel.value,
      theme: themeSel.value,
      cursor: cursorSel.value,
      speed: speedSel.value,
      durationS: parseFloat(durInput.value),
    });
  }

  sourceEl.addEventListener("input", refresh);
  durInput.addEventListener("input", () => { durVal.textContent = `${durInput.value}s`; persistDefaults(); });
  atInput.addEventListener("input", () => { atVal.textContent = `${parseFloat(atInput.value).toFixed(1)}s`; });
  langSel.addEventListener("change", persistDefaults);
  themeSel.addEventListener("change", persistDefaults);
  cursorSel.addEventListener("change", persistDefaults);
  speedSel.addEventListener("change", persistDefaults);

  insertBtn.addEventListener("click", async () => {
    insertBtn.disabled = true;
    statusEl.classList.remove("err");
    statusEl.textContent = "rendering…";
    try {
      const meta = await onInsert?.({
        source: sourceEl.value,
        language: langSel.value,
        theme: themeSel.value,
        cursor: cursorSel.value,
        speed: speedSel.value,
        durationS: parseFloat(durInput.value),
        insertAt: parseFloat(atInput.value),
      });
      statusEl.textContent = "inserted";
      if (meta) statEl.textContent = `${meta.chars} chars · ${meta.durationS.toFixed(1)}s`;
    } catch (e) {
      statusEl.textContent = String(e?.message ?? e);
      statusEl.classList.add("err");
    } finally {
      refresh();
    }
  });

  refresh();

  return {
    setSource(text, filename) {
      sourceEl.value = text;
      if (filename) {
        const ext = filename.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
        const map = { ts: "typescript", tsx: "typescript", js: "javascript", py: "python", rs: "rust", go: "go", json: "json", html: "html", css: "css", sql: "sql" };
        if (ext && map[ext]) langSel.value = map[ext];
      }
      refresh();
    },
    setStatus(msg, err = false) { statusEl.textContent = msg; statusEl.classList.toggle("err", !!err); },
    destroy() { root.innerHTML = ""; },
  };
}
