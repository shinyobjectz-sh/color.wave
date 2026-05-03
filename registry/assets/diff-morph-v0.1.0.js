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

// src/diff/tokenize.js
async function tokenize(text, language, theme = "github-dark") {
  const { highlighter } = await loadShiki();
  const lang = (highlighter.getLoadedLanguages?.() ?? []).includes(language) ? language : "javascript";
  const themed = highlighter.codeToTokens(text, { lang, theme });
  const out = [];
  let line = 0;
  for (const lineTokens of themed.tokens) {
    let col = 0;
    for (const tok of lineTokens) {
      const text2 = tok.content;
      const kind = classifyKind(text2, tok.color);
      out.push({
        id: `${line}:${col}:${kind}:${text2}`,
        text: text2,
        kind,
        color: tok.color || "#fff",
        line,
        col
      });
      col += text2.length;
    }
    out.push({ id: `${line}:eol`, text: "\n", kind: "eol", color: "transparent", line, col });
    line++;
  }
  return out;
}
var KEYWORDS = /* @__PURE__ */ new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "while",
  "for",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "class",
  "extends",
  "new",
  "this",
  "super",
  "import",
  "export",
  "default",
  "from",
  "as",
  "async",
  "await",
  "yield",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "instanceof",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "def",
  "lambda",
  "pass",
  "print",
  "not",
  "and",
  "or",
  "is",
  "in",
  "raise",
  "with",
  "global",
  "nonlocal",
  "fn",
  "mut",
  "pub",
  "let",
  "impl",
  "trait",
  "struct",
  "enum",
  "match",
  "Self",
  "package",
  "func",
  "go",
  "interface",
  "type",
  "map",
  "range",
  "var",
  "defer",
  "chan"
]);
function classifyKind(text, color) {
  if (/^\s+$/.test(text)) return "whitespace";
  if (/^[(){}\[\];,.:?]+$/.test(text)) return "punct";
  if (/^["'`]/.test(text)) return "string";
  if (/^\d/.test(text)) return "number";
  if (/^\/\/|^\/\*|^#/.test(text)) return "comment";
  if (KEYWORDS.has(text)) return "keyword";
  if (/^[A-Za-z_$][\w$]*$/.test(text)) return "ident";
  return "other";
}

// src/diff/align.js
var RENAME_DISTANCE = 2;
function alignTokens(tokensA, tokensB) {
  const a = tokensA.filter((t) => t.kind !== "whitespace" && t.kind !== "eol");
  const b = tokensB.filter((t) => t.kind !== "whitespace" && t.kind !== "eol");
  const ops = lcsDiff(a, b, equalToken);
  const promoted = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    const next = ops[i + 1];
    if (o.op === "remove" && next?.op === "insert" && o.a.kind === next.b.kind && o.a.kind === "ident" && editDistance(o.a.text, next.b.text) <= RENAME_DISTANCE) {
      promoted.push({ op: "rename", a: o.a, b: next.b });
      i++;
      continue;
    }
    promoted.push(o);
  }
  const stats = { kept: 0, inserted: 0, removed: 0, renamed: 0 };
  for (const o of promoted) stats[o.op === "keep" ? "kept" : o.op === "rename" ? "renamed" : o.op === "insert" ? "inserted" : "removed"]++;
  return { ops: promoted, stats };
}
function equalToken(a, b) {
  return a.kind === b.kind && a.text === b.text;
}
function lcsDiff(a, b, eq) {
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i2 = n - 1; i2 >= 0; i2--) {
    for (let j2 = m - 1; j2 >= 0; j2--) {
      lcs[i2][j2] = eq(a[i2], b[j2]) ? lcs[i2 + 1][j2 + 1] + 1 : Math.max(lcs[i2 + 1][j2], lcs[i2][j2 + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      ops.push({ op: "keep", a: a[i], b: b[j] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ op: "remove", a: a[i] });
      i++;
    } else {
      ops.push({ op: "insert", b: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ op: "remove", a: a[i++] });
  }
  while (j < m) {
    ops.push({ op: "insert", b: b[j++] });
  }
  return ops;
}
function editDistance(a, b) {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// src/render/compose.js
var GSAP_VERSION = "3.12.5";
function composeClip({ ops, before, after, language, theme, durationS, insertAt, clipId }) {
  const stageBHtml = buildStageHtml(ops.flatMap((o) => o.op === "keep" || o.op === "rename" || o.op === "insert" ? [o.op === "insert" ? { ...o.b, _state: "insert" } : { ...o.b || o.a, _state: o.op }] : []), clipId, "B");
  const stageAHtml = buildStageHtml(ops.flatMap((o) => o.op === "keep" || o.op === "rename" || o.op === "remove" ? [o.op === "remove" ? { ...o.a, _state: "remove" } : { ...o.a, _state: o.op }] : []), clipId, "A");
  const tlBody = buildTimeline(ops, clipId, durationS);
  const safeBefore = escapeAttr(before);
  const safeAfter = escapeAttr(after);
  return `<div class="cw-diff-morph" data-cw-diff-morph="${clipId}" data-start="${insertAt.toFixed(3)}" data-duration="${durationS.toFixed(3)}" data-before="${safeBefore}" data-after="${safeAfter}" data-language="${language}" data-theme="${theme}" style="position:absolute;inset:0;font:14px/1.5 ui-monospace,Menlo,monospace;">
<pre class="cw-dm-stage" data-stage="A">${stageAHtml}</pre>
<pre class="cw-dm-stage cw-dm-after" data-stage="B" style="display:none;">${stageBHtml}</pre>
<style data-cw-diff-morph="${clipId}">
.cw-diff-morph .cw-dm-stage { margin: 0; padding: 24px 32px; background: #0f1117; color: #e7e9ee; min-height: 100%; }
.cw-diff-morph .cw-dm-stage pre, .cw-diff-morph .cw-dm-stage { white-space: pre; }
.cw-diff-morph [data-cw-tok] { display: inline-block; will-change: transform, opacity; transform-origin: 0 0; }
.cw-diff-morph [data-cw-tok][data-state="remove"] { opacity: 1; }
.cw-diff-morph [data-cw-tok][data-state="insert"] { opacity: 0; clip-path: inset(0 100% 0 0); }
.cw-diff-morph [data-cw-tok][data-state="rename"] { opacity: 1; }
</style>
<script type="module" data-cw-diff-morph="${clipId}">
${tlBody}
<\/script>
</div>`;
}
function buildStageHtml(tokens, clipId, stage) {
  return tokens.map((t, i) => {
    const id = `${clipId}-${stage}-${i}-${t.kind}`;
    const txt = escapeHtml(t.text);
    const stateAttr = ` data-state="${t._state}"`;
    return `<span data-cw-tok="${id}" data-kind="${t.kind}" data-text="${escapeAttr(t.text)}" data-color="${t.color}" style="color:${t.color};"${stateAttr}>${txt}</span>`;
  }).join("");
}
function buildTimeline(ops, clipId, durationS) {
  const dur = durationS;
  const removePhase = Math.max(0.18, dur * 0.3);
  const flipPhase = Math.max(0.2, dur * 0.3);
  const insertPhase = Math.max(0.25, dur * 0.4);
  return `
import { gsap } from "https://esm.sh/gsap@${GSAP_VERSION}";
const root = document.querySelector('[data-cw-diff-morph="${clipId}"]');
if (root) {
  const stageA = root.querySelector('[data-stage="A"]');
  const stageB = root.querySelector('[data-stage="B"]');
  // Capture FIRST positions of "kept"/"rename" tokens in stage A.
  const firsts = new Map();
  for (const el of stageA.querySelectorAll('[data-cw-tok][data-state="keep"], [data-cw-tok][data-state="rename"]')) {
    firsts.set(el.dataset.text + ':' + el.dataset.kind + ':' + el.dataset.cwTok.split('-').slice(-2)[1], el.getBoundingClientRect());
  }
  const tl = gsap.timeline({ paused: true });
  // Phase 1: dissolve removes
  tl.to(stageA.querySelectorAll('[data-state="remove"]'), {
    autoAlpha: 0, filter: 'blur(4px)', duration: ${removePhase.toFixed(3)}, stagger: 0.01, ease: 'power2.in'
  }, 0);
  // Phase 2: swap A\u2192B at midpoint, then FLIP kept tokens.
  tl.add(() => { stageA.style.display = 'none'; stageB.style.display = ''; }, ${removePhase.toFixed(3)});
  tl.add(() => {
    const lasts = new Map();
    for (const el of stageB.querySelectorAll('[data-state="keep"], [data-state="rename"]')) {
      const key = el.dataset.text + ':' + el.dataset.kind + ':' + el.dataset.cwTok.split('-').slice(-2)[1];
      const last = el.getBoundingClientRect();
      const first = firsts.get(key);
      if (first) {
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: ${flipPhase.toFixed(3)}, ease: 'power2.inOut' });
      }
    }
  }, ${removePhase.toFixed(3)});
  // Phase 3: wipe inserts.
  tl.fromTo(stageB.querySelectorAll('[data-state="insert"]'), {
    autoAlpha: 0, clipPath: 'inset(0 100% 0 0)'
  }, {
    autoAlpha: 1, clipPath: 'inset(0 0% 0 0)', duration: ${insertPhase.toFixed(3)}, stagger: 0.012, ease: 'power2.out'
  }, ${(removePhase + flipPhase).toFixed(3)});
  // Drive timeline from playhead.
  function tick() {
    const v = document.querySelector('video,audio');
    const t = v ? v.currentTime : (typeof window.cw?.time === 'number' ? window.cw.time : performance.now() / 1000);
    const clipStart = ${ops.length ? 0 : 0};
    tl.seek(Math.max(0, Math.min(tl.duration(), t - clipStart)));
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
function mountDiffPanel(root, deps) {
  const { onInsert } = deps;
  root.innerHTML = `
    <div class="dm-wrap">
      <header class="dm-head">
        <div class="dm-title">diff-morph</div>
        <div class="dm-stats">\u2014 diff stats</div>
      </header>
      <div class="dm-section">
        <div class="dm-section-label">before</div>
        <textarea class="dm-before" placeholder="paste old code\u2026" spellcheck="false"></textarea>
      </div>
      <div class="dm-section">
        <div class="dm-section-label">after</div>
        <textarea class="dm-after" placeholder="paste new code\u2026" spellcheck="false"></textarea>
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
  durInput.addEventListener("input", () => {
    durVal.textContent = `${durInput.value}s`;
  });
  atInput.addEventListener("input", () => {
    atVal.textContent = `${parseFloat(atInput.value).toFixed(1)}s`;
  });
  insertBtn.addEventListener("click", async () => {
    insertBtn.disabled = true;
    try {
      const stats = await onInsert?.({
        before: beforeEl.value,
        after: afterEl.value,
        language: langSel.value,
        durationS: parseFloat(durInput.value),
        insertAt: parseFloat(atInput.value)
      });
      if (stats) statsEl.textContent = `kept ${stats.kept} \xB7 ins ${stats.inserted} \xB7 del ${stats.removed}${stats.renamed ? ` \xB7 ren ${stats.renamed}` : ""}`;
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
    setBefore(v) {
      beforeEl.value = v;
      refreshState();
    },
    setAfter(v) {
      afterEl.value = v;
      refreshState();
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
  id: "diff-morph",
  name: "Diff Morph",
  version: "0.1.0",
  description: "Animated token-level morph between two code snippets. FLIP slide kept tokens; dissolve removes; wipe inserts.",
  icon: "\u2194",
  surfaces: ["panel-tabs", "settings", "agent-tools"],
  permissions: ["network:esm.sh"]
};
var DEFAULT_DUR = 1.4;
var DEFAULTS = {
  language: "typescript",
  theme: "github-dark",
  durationS: DEFAULT_DUR
};
async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { ...DEFAULTS };
  let panel = null;
  async function buildAndInsertClip({ before, after, language, durationS, insertAt }) {
    if (!before?.trim() || !after?.trim()) throw new Error("provide before AND after");
    const lang = language || defaults.language;
    const theme = defaults.theme;
    const tokensA = await tokenize(before, lang, theme);
    const tokensB = await tokenize(after, lang, theme);
    const { ops, stats } = alignTokens(tokensA, tokensB);
    const clipId = "dm" + Math.random().toString(36).slice(2, 10);
    const fragment = composeClip({
      ops,
      before,
      after,
      language: lang,
      theme,
      durationS: durationS || defaults.durationS,
      insertAt: insertAt ?? 0,
      clipId
    });
    const html = await wb.composition.read();
    const next = injectClip(html, fragment);
    await wb.composition.write(next, "diff-morph: insert clip");
    await wb.composition.repaint();
    return { clipId, stats };
  }
  wb.panels.addTab({
    id: "diff-morph",
    label: "Diff",
    icon: "\u2194",
    component: null,
    mount(root) {
      panel = mountDiffPanel(root, {
        async onInsert(args) {
          const { stats } = await buildAndInsertClip({
            ...args,
            language: args.language || defaults.language,
            durationS: args.durationS || defaults.durationS
          });
          return stats;
        }
      });
      return () => {
        panel?.destroy();
        panel = null;
      };
    }
  });
  wb.settings.addSection({
    label: "Diff Morph",
    mount(root) {
      root.innerHTML = `
        <div class="dms">
          <label>default duration <span class="dms-dur-val">${defaults.durationS.toFixed(1)}s</span>
            <input type="range" class="dms-dur" min="0.5" max="4" step="0.1" value="${defaults.durationS}">
          </label>
          <label>theme
            <select class="dms-theme">
              <option value="github-dark">GitHub Dark</option>
              <option value="github-light">GitHub Light</option>
              <option value="vitesse-dark">Vitesse Dark</option>
            </select>
          </label>
          <label>default language
            <select class="dms-lang">
              ${["typescript", "javascript", "python", "rust", "go", "json", "html", "css", "sql"].map((l) => `<option value="${l}">${l}</option>`).join("")}
            </select>
          </label>
        </div>
        <style>
          .dms { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); display: grid; gap: 8px; }
          .dms label { display: flex; flex-direction: column; gap: 3px; color: var(--color-fg); }
          .dms input, .dms select { padding: 6px 8px; background: var(--color-page); border: 1px solid var(--color-border); color: var(--color-fg); border-radius: 4px; font: inherit; }
        </style>
      `;
      const dur = root.querySelector(".dms-dur");
      const durVal = root.querySelector(".dms-dur-val");
      const theme = root.querySelector(".dms-theme");
      const lang = root.querySelector(".dms-lang");
      theme.value = defaults.theme;
      lang.value = defaults.language;
      const save = async () => {
        defaults = {
          ...defaults,
          durationS: parseFloat(dur.value),
          theme: theme.value,
          language: lang.value
        };
        durVal.textContent = `${defaults.durationS.toFixed(1)}s`;
        await wb.storage.set("defaults", defaults);
      };
      dur.addEventListener("input", save);
      theme.addEventListener("change", save);
      lang.addEventListener("change", save);
      return () => {
        root.innerHTML = "";
      };
    }
  });
  wb.agent.registerTool({
    definition: {
      name: "diff_morph",
      description: "Insert a code-morph clip into the composition. Token-level diff with FLIP-animated kept tokens, dissolved removes, and wiped inserts.",
      parameters: {
        type: "object",
        properties: {
          before: { type: "string", description: "Original code." },
          after: { type: "string", description: "New code." },
          language: { type: "string", description: "Shiki language id (typescript / python / etc.). Defaults to typescript." },
          duration_s: { type: "number", minimum: 0.4, maximum: 6 },
          insert_at_s: { type: "number", minimum: 0, description: "Timeline insertion start in seconds (default 0)." }
        },
        required: ["before", "after"]
      }
    },
    async invoke({ before, after, language, duration_s, insert_at_s }) {
      const { clipId, stats } = await buildAndInsertClip({
        before,
        after,
        language,
        durationS: duration_s,
        insertAt: insert_at_s
      });
      return JSON.stringify({ ok: true, clipId, stats });
    }
  });
  wb.log("diff-morph activated");
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
