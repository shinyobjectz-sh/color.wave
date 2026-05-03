// src/shiki-loader.js
var SHIKI_CDN = "https://esm.sh/shiki@1.22.2";
var CACHE_KEY = "__cw_shiki_v1";
async function loadShiki() {
  const existing = globalThis[CACHE_KEY];
  if (existing) return await existing;
  const promise = (async () => {
    const mod = await import(
      /* @vite-ignore */
      /* webpackIgnore: true */
      SHIKI_CDN
    );
    const highlighter = await mod.createHighlighter({
      themes: ["github-dark", "github-light", "vitesse-dark"],
      langs: ["typescript", "javascript", "python", "rust", "go", "json", "html", "css", "sql"]
    });
    return { mod, highlighter };
  })();
  globalThis[CACHE_KEY] = promise;
  return await promise;
}

// src/ingest.js
var MAX_CHARS = 2e3;
async function ingest(source, language, theme = "github-dark") {
  const trimmed = source.length > MAX_CHARS ? source.slice(0, MAX_CHARS) + "\n\u2026\n" : source;
  const { highlighter } = await loadShiki();
  const lang = (highlighter.getLoadedLanguages?.() ?? []).includes(language) ? language : "javascript";
  const themed = highlighter.codeToTokens(trimmed, { lang, theme });
  const chars = [];
  for (const lineTokens of themed.tokens) {
    for (const tok of lineTokens) {
      const color = tok.color || "#fff";
      for (const ch of [...tok.content]) {
        chars.push({ text: ch, color });
      }
    }
    chars.push({ text: "\n", color: "transparent" });
  }
  return { chars, truncated: source.length > MAX_CHARS };
}

// src/detect.js
var EXT_MAP = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  sql: "sql"
};
var SHEBANG_MAP = {
  python: "python",
  python3: "python",
  node: "javascript",
  bun: "javascript"
};
function detectLanguage(filename, source) {
  if (filename) {
    const m = filename.match(/\.([a-zA-Z0-9]+)$/);
    if (m && EXT_MAP[m[1].toLowerCase()]) return EXT_MAP[m[1].toLowerCase()];
  }
  if (source) {
    const first = source.split("\n", 1)[0] ?? "";
    const sh = first.match(/#!.*?\/(\w+)$/);
    if (sh && SHEBANG_MAP[sh[1]]) return SHEBANG_MAP[sh[1]];
    if (/^(def |import |from .* import |class .*:)/m.test(source)) return "python";
    if (/\bfn\s+\w+\s*\(/.test(source)) return "rust";
    if (/^package\s+\w+/m.test(source) && /\bfunc\s+\w+\(/.test(source)) return "go";
  }
  return "typescript";
}

// src/schedule.js
function buildSchedule(text, totalDur, curve, opts = {}) {
  const N = text.length;
  if (N === 0) return new Float32Array(0);
  const pauseLineBreakMs = opts.pauseLineBreakMs ?? 80;
  const pauseSemicolonMs = opts.pauseSemicolonMs ?? 40;
  let pauseS = 0;
  for (let i = 0; i < N; i++) {
    const c = text[i];
    if (c === "\n") pauseS += pauseLineBreakMs / 1e3;
    else if (c === ";") pauseS += pauseSemicolonMs / 1e3;
  }
  const baseDur = Math.max(0.1, totalDur - pauseS);
  const out = new Float32Array(N);
  let cumPause = 0;
  for (let i = 0; i < N; i++) {
    const u = (i + 1) / N;
    const f = bezierY(curve, u);
    out[i] = f * baseDur + cumPause;
    const c = text[i];
    if (c === "\n") cumPause += pauseLineBreakMs / 1e3;
    else if (c === ";") cumPause += pauseSemicolonMs / 1e3;
  }
  return out;
}
function bezierY(curve, t) {
  const u = 1 - t;
  return 3 * u * u * t * curve.p1.y + 3 * u * t * t * curve.p2.y + t * t * t;
}
var SPEED_PRESETS = [
  { id: "linear", label: "Linear", p1: { x: 0.5, y: 0.5 }, p2: { x: 0.5, y: 0.5 } },
  { id: "human", label: "Human", p1: { x: 0.25, y: 0.45 }, p2: { x: 0.65, y: 0.85 } },
  { id: "dramatic-pause", label: "Dramatic pause", p1: { x: 0.7, y: 0.05 }, p2: { x: 0.3, y: 0.95 } },
  { id: "staccato", label: "Staccato", p1: { x: 0.1, y: 0.7 }, p2: { x: 0.3, y: 0.9 } }
];
function findSpeed(id) {
  return SPEED_PRESETS.find((p) => p.id === id) ?? SPEED_PRESETS[0];
}

// src/themes.js
var THEMES = [
  { id: "github-dark", label: "GitHub Dark", bg: "#0d1117", fg: "#c9d1d9", cursor: "#58a6ff" },
  { id: "github-light", label: "GitHub Light", bg: "#ffffff", fg: "#24292f", cursor: "#0969da" },
  { id: "vitesse-dark", label: "Vitesse Dark", bg: "#121212", fg: "#dbd7caee", cursor: "#dbd7ca" }
];
function findTheme(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
var DEFAULT_THEME_ID = "github-dark";

// src/render/compose.js
function composeClip({ chars, schedule, theme, cursorStyle, durationS, insertAt, clipId, filename }) {
  const N = chars.length;
  const scheduleArr = [];
  for (let i = 0; i < N; i++) scheduleArr.push(+schedule[i].toFixed(3));
  const charsHtml = chars.map((ch, i) => {
    if (ch.text === "\n") return `<br data-cw-i="${i}">`;
    const t = escapeHtml(ch.text);
    return `<span data-cw-i="${i}" style="color:${ch.color};">${t}</span>`;
  }).join("");
  return `<section class="cw-code-clip" data-cw-kind="code-clip" data-cw-clip-id="${clipId}" data-start="${insertAt.toFixed(3)}" data-duration="${durationS.toFixed(3)}" data-cw-filename="${escapeAttr(filename || "")}" style="position:absolute;inset:0;background:${theme.bg};color:${theme.fg};font:14px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:32px 40px;overflow:hidden;">
<style data-cw-clip-id="${clipId}">
.cw-code-clip[data-cw-clip-id="${clipId}"] [data-cw-i] { opacity: 0; transition: opacity 80ms linear; }
.cw-code-clip[data-cw-clip-id="${clipId}"] [data-cw-i][data-cw-revealed="1"] { opacity: 1; }
.cw-code-clip[data-cw-clip-id="${clipId}"] .cw-cursor { position: absolute; width: ${cursorStyle === "beam" ? "2px" : cursorStyle === "underscore" ? "0.6em" : "0.6em"}; height: ${cursorStyle === "underscore" ? "2px" : "1.2em"}; background: ${theme.cursor}; pointer-events: none; transform: translate3d(0,0,0); transition: transform 90ms ease; ${cursorStyle === "underscore" ? "" : "mix-blend-mode: difference;"} }
.cw-code-clip[data-cw-clip-id="${clipId}"] .cw-cursor.blink { animation: cw-cursor-blink 800ms steps(2) infinite; }
@keyframes cw-cursor-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
.cw-code-clip[data-cw-clip-id="${clipId}"] pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
</style>
<pre>${charsHtml}</pre>
<span class="cw-cursor blink" data-cw-cursor></span>
<script type="application/json" data-cw-schedule="${clipId}">${JSON.stringify(scheduleArr)}<\/script>
<script type="module" data-cw-clip-id="${clipId}">
${runtimeShim(clipId)}
<\/script>
</section>`;
}
function runtimeShim(clipId) {
  return `
const root = document.querySelector('.cw-code-clip[data-cw-clip-id="${clipId}"]');
if (root) {
  const sched = JSON.parse(document.querySelector('script[data-cw-schedule="${clipId}"]').textContent);
  const spans = Array.from(root.querySelectorAll('[data-cw-i]'));
  const cursor = root.querySelector('[data-cw-cursor]');
  const clipStart = parseFloat(root.getAttribute('data-start') || '0');
  let lastIdx = -1;
  function targetTime() {
    const v = document.querySelector('video,audio');
    return v ? v.currentTime - clipStart : (typeof window.cw?.time === 'number' ? window.cw.time - clipStart : performance.now() / 1000 - clipStart);
  }
  function tick() {
    const t = targetTime();
    // Binary search the largest i with sched[i] <= t.
    let lo = 0, hi = sched.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sched[mid] <= t) lo = mid + 1; else hi = mid;
    }
    const idx = lo - 1;
    if (idx !== lastIdx) {
      // Walk forward or backward to update reveal flags.
      if (idx > lastIdx) {
        for (let i = lastIdx + 1; i <= idx; i++) {
          const el = spans[i];
          if (el && el.dataset) el.dataset.cwRevealed = '1';
        }
      } else {
        for (let i = lastIdx; i > idx; i--) {
          const el = spans[i];
          if (el && el.dataset) el.dataset.cwRevealed = '0';
        }
      }
      lastIdx = idx;
      // Cursor: position at right edge of last revealed visible char.
      const last = idx >= 0 ? spans[idx] : null;
      if (cursor && last && last.getBoundingClientRect) {
        const r = last.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        cursor.style.transform = 'translate3d(' + (r.right - rr.left) + 'px,' + (r.top - rr.top) + 'px,0)';
        cursor.classList.toggle('blink', idx >= sched.length - 1);
      } else if (cursor && idx < 0) {
        cursor.style.transform = 'translate3d(0,0,0)';
      }
    }
    requestAnimationFrame(tick);
  }
  tick();
}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// src/panel/mount.js
var LANGS = ["typescript", "javascript", "python", "rust", "go", "json", "html", "css", "sql"];
function mountCodePanel(root, deps) {
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
  function refresh() {
    insertBtn.disabled = !sourceEl.value.trim();
  }
  function persistDefaults() {
    setDefaults({
      language: langSel.value,
      theme: themeSel.value,
      cursor: cursorSel.value,
      speed: speedSel.value,
      durationS: parseFloat(durInput.value)
    });
  }
  sourceEl.addEventListener("input", refresh);
  durInput.addEventListener("input", () => {
    durVal.textContent = `${durInput.value}s`;
    persistDefaults();
  });
  atInput.addEventListener("input", () => {
    atVal.textContent = `${parseFloat(atInput.value).toFixed(1)}s`;
  });
  langSel.addEventListener("change", persistDefaults);
  themeSel.addEventListener("change", persistDefaults);
  cursorSel.addEventListener("change", persistDefaults);
  speedSel.addEventListener("change", persistDefaults);
  insertBtn.addEventListener("click", async () => {
    insertBtn.disabled = true;
    statusEl.classList.remove("err");
    statusEl.textContent = "rendering\u2026";
    try {
      const meta = await onInsert?.({
        source: sourceEl.value,
        language: langSel.value,
        theme: themeSel.value,
        cursor: cursorSel.value,
        speed: speedSel.value,
        durationS: parseFloat(durInput.value),
        insertAt: parseFloat(atInput.value)
      });
      statusEl.textContent = "inserted";
      if (meta) statEl.textContent = `${meta.chars} chars \xB7 ${meta.durationS.toFixed(1)}s`;
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
    setStatus(msg, err = false) {
      statusEl.textContent = msg;
      statusEl.classList.toggle("err", !!err);
    },
    destroy() {
      root.innerHTML = "";
    }
  };
}

// src/index.js
var manifest = {
  id: "code-clip",
  name: "Code Clip",
  version: "0.1.0",
  description: "Drop a code file \u2192 typing-out highlighted clip with cursor + speed bezier. The 'only-because-HTML' demo.",
  icon: "{ }",
  surfaces: ["chat-input-actions", "panel-tabs", "settings", "agent-tools"],
  permissions: ["network:esm.sh"]
};
var DEFAULTS = {
  language: "typescript",
  theme: DEFAULT_THEME_ID,
  cursor: "block",
  speed: "human",
  durationS: 8,
  voiceover: false
};
async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { ...DEFAULTS };
  let panel = null;
  async function buildAndInsert({ source, language, theme, cursor, speed, durationS, insertAt, filename }) {
    if (!source?.trim()) throw new Error("source is empty");
    const lang = language && language !== "auto" ? language : detectLanguage(filename, source);
    const themeDef = findTheme(theme || defaults.theme);
    const speedDef = findSpeed(speed || defaults.speed);
    const dur = durationS || defaults.durationS;
    const { chars, truncated } = await ingest(source, lang, themeDef.id);
    if (!chars.length) throw new Error("no characters to render");
    const schedule = buildSchedule(
      chars.map((c) => c.text).join(""),
      dur,
      speedDef,
      { pauseLineBreakMs: 80, pauseSemicolonMs: 40 }
    );
    const clipId = "cc" + Math.random().toString(36).slice(2, 10);
    const fragment = composeClip({
      chars,
      schedule,
      theme: themeDef,
      cursorStyle: cursor || defaults.cursor,
      durationS: dur,
      insertAt: insertAt ?? 0,
      clipId,
      filename: filename ?? ""
    });
    const html = await wb.composition.read();
    const next = injectClip(html, fragment);
    await wb.composition.write(next, "code-clip: insert clip");
    await wb.composition.repaint();
    return { clipId, chars: chars.length, durationS: dur, truncated };
  }
  wb.chat.addInputAction({
    icon: "{ }",
    label: "Code",
    onClick() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.rs,.go,.json,.html,.css,.sql,text/*";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const source = await file.text();
        const lang = detectLanguage(file.name, source);
        try {
          const meta = await buildAndInsert({
            source,
            language: lang,
            theme: defaults.theme,
            cursor: defaults.cursor,
            speed: defaults.speed,
            durationS: defaults.durationS,
            insertAt: 0,
            filename: file.name
          });
          wb.chat.setInput(`Inserted code-clip: ${file.name} \u2192 ${meta.durationS}s @ ${meta.chars} chars${meta.truncated ? " (truncated)" : ""}`);
        } catch (e) {
          wb.log(`code-clip ingest error: ${e?.message ?? e}`);
        }
      });
      input.click();
    }
  });
  wb.panels.addTab({
    id: "code-clip",
    label: "Code",
    icon: "{ }",
    component: null,
    mount(root) {
      panel = mountCodePanel(root, {
        getDefaults: () => defaults,
        setDefaults(d) {
          defaults = { ...defaults, ...d };
          wb.storage.set("defaults", defaults);
        },
        async onInsert(args) {
          return await buildAndInsert(args);
        }
      });
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.settings.addSection({
    label: "Code Clip",
    mount(root) {
      root.innerHTML = `
        <div class="ccs">
          <label>default theme
            <select class="ccs-theme">${THEMES.map((t2) => `<option value="${t2.id}">${t2.label}</option>`).join("")}</select>
          </label>
          <label>default cursor
            <select class="ccs-cursor">
              <option value="block">Block</option>
              <option value="beam">Beam</option>
              <option value="underscore">Underscore</option>
            </select>
          </label>
          <label>default speed curve
            <select class="ccs-speed">${SPEED_PRESETS.map((s2) => `<option value="${s2.id}">${s2.label}</option>`).join("")}</select>
          </label>
          <label>default duration <span class="ccs-dur-val">${defaults.durationS}s</span>
            <input type="range" class="ccs-dur" min="2" max="30" step="0.5" value="${defaults.durationS}">
          </label>
          <p class="ccs-hint">code-clip ships zero ML in v0.1. ElevenLabs voice-over is queued for v0.2.</p>
        </div>
        <style>
          .ccs { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); display: grid; gap: 8px; }
          .ccs label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg); }
          .ccs select, .ccs input { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
          .ccs-hint { font-size: 10px; margin: 4px 0 0; line-height: 1.5; }
        </style>
      `;
      const t = root.querySelector(".ccs-theme");
      const c = root.querySelector(".ccs-cursor");
      const s = root.querySelector(".ccs-speed");
      const d = root.querySelector(".ccs-dur");
      const dv = root.querySelector(".ccs-dur-val");
      t.value = defaults.theme;
      c.value = defaults.cursor;
      s.value = defaults.speed;
      const save = async () => {
        defaults = {
          ...defaults,
          theme: t.value,
          cursor: c.value,
          speed: s.value,
          durationS: parseFloat(d.value)
        };
        dv.textContent = `${defaults.durationS}s`;
        await wb.storage.set("defaults", defaults);
      };
      t.addEventListener("change", save);
      c.addEventListener("change", save);
      s.addEventListener("change", save);
      d.addEventListener("input", save);
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "code_clip",
      description: "Insert a typing-out, syntax-highlighted code clip into the composition. Returns clipId + char count + final duration.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", description: "Code to render. Required if source_url not provided." },
          source_url: { type: "string", description: "URL to fetch source from. Either source or source_url required." },
          language: { type: "string", description: "Shiki language id (typescript / python / rust / go / etc.) or 'auto'." },
          theme: { type: "string", enum: THEMES.map((t) => t.id) },
          cursor: { type: "string", enum: ["block", "beam", "underscore"] },
          speed: { type: "string", enum: SPEED_PRESETS.map((s) => s.id) },
          duration_s: { type: "number", minimum: 1, maximum: 60 },
          insert_at_s: { type: "number", minimum: 0 },
          filename: { type: "string" }
        }
      }
    },
    async invoke({ source, source_url, language, theme, cursor, speed, duration_s, insert_at_s, filename }) {
      let src = source;
      if (!src && source_url) {
        const r = await fetch(source_url);
        if (!r.ok) throw new Error(`fetch ${source_url}: ${r.status}`);
        src = await r.text();
      }
      const meta = await buildAndInsert({
        source: src,
        language: language || "auto",
        theme,
        cursor,
        speed,
        durationS: duration_s,
        insertAt: insert_at_s,
        filename: filename ?? source_url ?? null
      });
      return JSON.stringify({ ok: true, ...meta });
    }
  });
  wb.log("code-clip activated");
}
function injectClip(html, fragment) {
  const closeBody = html.lastIndexOf("</body>");
  if (closeBody >= 0) {
    return html.slice(0, closeBody) + "\n" + fragment + "\n" + html.slice(closeBody);
  }
  return html + "\n" + fragment + "\n";
}
export {
  manifest,
  onActivate
};
