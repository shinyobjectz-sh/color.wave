// code-clip — drop a code file → typing-out highlighted clip.
//
// HOW IT WORKS
// 1. User clicks "+ Code" in chat (file picker), drops code into the
//    Code panel, or the agent calls `code_clip(...)`.
// 2. Source is Shiki-tokenized via the shared shiki-loader (cached
//    on globalThis.__cw_shiki_v1, shared with diff-morph).
// 3. We split into per-character spans with stable indices, compute
//    a reveal schedule from a speed-bezier preset (linear / human /
//    dramatic-pause / staccato) plus pause hooks at \n and ;.
// 4. Compose emits a self-contained <section data-cw-kind="code-clip">
//    with inline <style>, the colored spans, a <script type=app/json>
//    schedule, and a <script type=module> runtime that watches the
//    playhead and toggles data-cw-revealed on each char as time crosses
//    its schedule entry. A cursor follows the latest revealed char.
// 5. Inserts as a real timeline clip (data-start/data-duration).

import { ingest } from "./ingest.js";
import { detectLanguage } from "./detect.js";
import { buildSchedule, findSpeed, SPEED_PRESETS } from "./schedule.js";
import { findTheme, THEMES, DEFAULT_THEME_ID } from "./themes.js";
import { composeClip } from "./render/compose.js";
import { mountCodePanel } from "./panel/mount.js";

export const manifest = {
  id: "code-clip",
  name: "Code Clip",
  version: "0.1.0",
  description: "Drop a code file → typing-out highlighted clip with cursor + speed bezier. The 'only-because-HTML' demo.",
  icon: "{ }",
  surfaces: ["chat-input-actions", "panel-tabs", "settings", "agent-tools"],
  permissions: ["network:esm.sh"],
};

const DEFAULTS = {
  language: "typescript",
  theme: DEFAULT_THEME_ID,
  cursor: "block",
  speed: "human",
  durationS: 8,
  voiceover: false,
};

export async function onActivate(wb) {
  let defaults = wb.storage.get("defaults") ?? { ...DEFAULTS };
  let panel = null;

  async function buildAndInsert({ source, language, theme, cursor, speed, durationS, insertAt, filename }) {
    if (!source?.trim()) throw new Error("source is empty");
    const lang = (language && language !== "auto") ? language : detectLanguage(filename, source);
    const themeDef = findTheme(theme || defaults.theme);
    const speedDef = findSpeed(speed || defaults.speed);
    const dur = durationS || defaults.durationS;
    const { chars, truncated } = await ingest(source, lang, themeDef.id);
    if (!chars.length) throw new Error("no characters to render");
    const schedule = buildSchedule(
      chars.map((c) => c.text).join(""),
      dur,
      speedDef,
      { pauseLineBreakMs: 80, pauseSemicolonMs: 40 },
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
      filename: filename ?? "",
    });
    const html = await wb.composition.read();
    const next = injectClip(html, fragment);
    await wb.composition.write(next, "code-clip: insert clip");
    await wb.composition.repaint();
    return { clipId, chars: chars.length, durationS: dur, truncated };
  }

  // ── chat input action ─────────────────────────────────────────────
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
            filename: file.name,
          });
          wb.chat.setInput(`Inserted code-clip: ${file.name} → ${meta.durationS}s @ ${meta.chars} chars${meta.truncated ? " (truncated)" : ""}`);
        } catch (e) {
          wb.log(`code-clip ingest error: ${e?.message ?? e}`);
        }
      });
      input.click();
    },
  });

  // ── panel ─────────────────────────────────────────────────────────
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
        },
      });
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── settings ──────────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Code Clip",
    mount(root) {
      root.innerHTML = `
        <div class="ccs">
          <label>default theme
            <select class="ccs-theme">${THEMES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("")}</select>
          </label>
          <label>default cursor
            <select class="ccs-cursor">
              <option value="block">Block</option>
              <option value="beam">Beam</option>
              <option value="underscore">Underscore</option>
            </select>
          </label>
          <label>default speed curve
            <select class="ccs-speed">${SPEED_PRESETS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select>
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
      t.value = defaults.theme; c.value = defaults.cursor; s.value = defaults.speed;
      const save = async () => {
        defaults = {
          ...defaults,
          theme: t.value,
          cursor: c.value,
          speed: s.value,
          durationS: parseFloat(d.value),
        };
        dv.textContent = `${defaults.durationS}s`;
        await wb.storage.set("defaults", defaults);
      };
      t.addEventListener("change", save);
      c.addEventListener("change", save);
      s.addEventListener("change", save);
      d.addEventListener("input", save);
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
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
          filename: { type: "string" },
        },
      },
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
        filename: filename ?? source_url ?? null,
      });
      return JSON.stringify({ ok: true, ...meta });
    },
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
