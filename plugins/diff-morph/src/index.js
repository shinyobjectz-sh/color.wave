// diff-morph — animated token-level morph between two code snippets.
//
// Pipeline: Shiki tokenize (lazy CDN, shared with code-clip) → LCS-based
// token diff with rename promotion → self-contained HTML clip carrying
// inline GSAP timeline (FLIP slide on kept tokens, dissolve on removes,
// wipe on inserts) → appended to composition source as a new clip with
// data-start / data-duration so the colorwave timeline picks it up.

import { tokenize } from "./diff/tokenize.js";
import { alignTokens } from "./diff/align.js";
import { composeClip } from "./render/compose.js";
import { mountDiffPanel } from "./panel/mount.js";

export const manifest = {
  id: "diff-morph",
  name: "Diff Morph",
  version: "0.1.0",
  description: "Animated token-level morph between two code snippets. FLIP slide kept tokens; dissolve removes; wipe inserts.",
  icon: "↔",
  surfaces: ["panel-tabs", "settings", "agent-tools"],
  permissions: ["network:esm.sh"],
};

const DEFAULT_DUR = 1.4;
const DEFAULTS = {
  language: "typescript",
  theme: "github-dark",
  durationS: DEFAULT_DUR,
};

export async function onActivate(wb) {
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
      ops, before, after, language: lang, theme,
      durationS: durationS || defaults.durationS,
      insertAt: insertAt ?? 0,
      clipId,
    });
    const html = await wb.composition.read();
    const next = injectClip(html, fragment);
    await wb.composition.write(next, "diff-morph: insert clip");
    await wb.composition.repaint();
    return { clipId, stats };
  }

  // ── panel ─────────────────────────────────────────────────────────
  wb.panels.addTab({
    id: "diff-morph",
    label: "Diff",
    icon: "↔",
    component: null,
    mount(root) {
      panel = mountDiffPanel(root, {
        async onInsert(args) {
          const { stats } = await buildAndInsertClip({
            ...args,
            language: args.language || defaults.language,
            durationS: args.durationS || defaults.durationS,
          });
          return stats;
        },
      });
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── settings ──────────────────────────────────────────────────────
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
              ${["typescript","javascript","python","rust","go","json","html","css","sql"].map(l => `<option value="${l}">${l}</option>`).join("")}
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
          language: lang.value,
        };
        durVal.textContent = `${defaults.durationS.toFixed(1)}s`;
        await wb.storage.set("defaults", defaults);
      };
      dur.addEventListener("input", save);
      theme.addEventListener("change", save);
      lang.addEventListener("change", save);
      return () => { root.innerHTML = ""; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "diff_morph",
      description: "Insert a code-morph clip into the composition. Token-level diff with FLIP-animated kept tokens, dissolved removes, and wiped inserts.",
      parameters: {
        type: "object",
        properties: {
          before: { type: "string", description: "Original code." },
          after:  { type: "string", description: "New code." },
          language: { type: "string", description: "Shiki language id (typescript / python / etc.). Defaults to typescript." },
          duration_s: { type: "number", minimum: 0.4, maximum: 6 },
          insert_at_s: { type: "number", minimum: 0, description: "Timeline insertion start in seconds (default 0)." },
        },
        required: ["before", "after"],
      },
    },
    async invoke({ before, after, language, duration_s, insert_at_s }) {
      const { clipId, stats } = await buildAndInsertClip({
        before, after,
        language,
        durationS: duration_s,
        insertAt: insert_at_s,
      });
      return JSON.stringify({ ok: true, clipId, stats });
    },
  });

  wb.log("diff-morph activated");
}

/**
 * Insert the clip fragment near the end of <body>. If <body> isn't
 * present, append at end of document.
 */
function injectClip(html, fragment) {
  const closeBody = html.lastIndexOf("</body>");
  if (closeBody >= 0) {
    return html.slice(0, closeBody) + "\n" + fragment + "\n" + html.slice(closeBody);
  }
  return html + "\n" + fragment + "\n";
}
