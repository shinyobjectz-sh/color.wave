// palette-swap — recolor the entire composition with a one-click preset.
//
// HOW IT WORKS
// The plugin registers a composition decorator that, when a palette is
// active, injects a small <style> block into the rendered iframe HTML
// setting CSS custom properties on :root. Compositions that reference
// those variables (e.g. `background: var(--cw-bg)`) recolor instantly.
// Compositions that don't are unaffected — palette-swap is opt-in at
// the composition level.
//
// The active preset id is persisted via wb.storage so it round-trips
// through Cmd+S along with the rest of the workbook.

import { PRESETS, findPreset } from "./presets.js";

export const manifest = {
  id: "palette-swap",
  name: "Palette Swap",
  version: "0.1.0",
  description: "Recolor the entire composition with a one-click palette preset. Adds a Palette section to Settings.",
  icon: "🎨",
  surfaces: ["composition-decorators", "settings"],
  permissions: [],
};

export async function onActivate(wb) {
  // Track the active id locally for the decorator. Initialise from
  // storage; subscribe so settings UI changes apply immediately.
  let activeId = wb.storage.get("active") ?? null;

  // Register a render decorator that prepends a :root style block when
  // a preset is active. Priority 100 — runs late so we win against
  // earlier decorators that might set their own :root vars.
  wb.composition.addRenderDecorator({
    priority: 100,
    transform(html) {
      const preset = activeId ? findPreset(activeId) : null;
      if (!preset) return html;
      const cssDecls = Object.entries(preset.vars)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      const styleBlock = `<style data-palette-swap="${preset.id}">\n:root {\n${cssDecls}\n}\n</style>\n`;
      return styleBlock + html;
    },
  });

  // Settings section — imperative DOM (plugins ship plain JS, no
  // Svelte build chain). Emits a styled card matching the host's
  // existing settings panel idiom.
  wb.settings.addSection({
    label: "Palette",
    mount(root) {
      root.innerHTML = `
        <div class="ps-wrap">
          <p class="ps-hint">
            Apply a color palette to compositions that use
            <code>--cw-bg</code>, <code>--cw-fg</code>,
            <code>--cw-mute</code>, <code>--cw-accent</code>.
            Compositions that don't reference those vars stay as-is.
          </p>
          <div class="ps-grid"></div>
          <button class="ps-clear" type="button">clear palette</button>
        </div>
        <style>
          .ps-wrap { font: 11px ui-monospace, monospace; color: var(--color-fg-muted); }
          .ps-wrap code { color: var(--color-fg); font-size: 10px; }
          .ps-hint { margin: 0 0 10px; line-height: 1.5; }
          .ps-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 8px;
          }
          .ps-card {
            display: flex; flex-direction: column; gap: 6px;
            padding: 8px;
            background: var(--color-page);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            cursor: pointer;
            transition: border-color 100ms ease, background 100ms ease;
          }
          .ps-card:hover { border-color: var(--color-fg-muted); }
          .ps-card.active {
            border-color: var(--color-accent);
            background: color-mix(in srgb, var(--color-accent) 8%, var(--color-page));
          }
          .ps-card-label {
            color: var(--color-fg);
            font-weight: 600;
            font-size: 11px;
            display: flex; align-items: center; justify-content: space-between;
            gap: 6px;
          }
          .ps-active-dot {
            width: 6px; height: 6px; border-radius: 999px;
            background: var(--color-accent);
            opacity: 0; transition: opacity 100ms ease;
          }
          .ps-card.active .ps-active-dot { opacity: 1; }
          .ps-swatches { display: flex; gap: 3px; height: 18px; }
          .ps-swatches > div {
            flex: 1; border-radius: 3px;
            border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
          }
          .ps-clear {
            margin-top: 10px;
            height: 24px; padding: 0 10px;
            background: transparent; color: var(--color-fg-muted);
            border: 1px solid var(--color-border); border-radius: 4px;
            font: 10px ui-monospace, monospace; cursor: pointer;
          }
          .ps-clear:hover:not(:disabled) {
            color: var(--color-fg); border-color: var(--color-fg);
          }
          .ps-clear:disabled { opacity: 0.4; cursor: not-allowed; }
        </style>
      `;

      const grid = root.querySelector(".ps-grid");
      const clearBtn = root.querySelector(".ps-clear");

      function render() {
        grid.innerHTML = "";
        for (const p of PRESETS) {
          const card = document.createElement("div");
          card.className = "ps-card";
          if (p.id === activeId) card.classList.add("active");
          card.innerHTML = `
            <div class="ps-card-label">
              <span>${escapeHtml(p.label)}</span>
              <span class="ps-active-dot"></span>
            </div>
            <div class="ps-swatches">
              ${p.swatches.map((c) => `<div style="background:${c}"></div>`).join("")}
            </div>
          `;
          card.addEventListener("click", async () => {
            activeId = p.id;
            await wb.storage.set("active", p.id);
            render();
            // Bump compositionDecorators by reading-then-writing one
            // arbitrary signal so the iframe re-renders with the new
            // palette. Easiest portable signal: the storage write
            // already commits; the host's iframe rebuild fires on the
            // next composition write or settings re-open. As a nudge,
            // dispatch a custom event the host listens to (currently
            // none), and rely on Svelte's reactivity to pick it up
            // from the storage change. If neither hits, the user can
            // close+reopen settings to see the change.
            await wb.composition.repaint();
          });
          grid.appendChild(card);
        }
        clearBtn.disabled = !activeId;
      }

      clearBtn.addEventListener("click", async () => {
        activeId = null;
        await wb.storage.delete("active");
        render();
        window.dispatchEvent(new CustomEvent("colorwave:repaint"));
      });

      render();

      // Cleanup: drop our DOM. Listeners die with the nodes.
      return () => { root.innerHTML = ""; };
    },
  });

  wb.log(`palette-swap activated (${PRESETS.length} presets, active=${activeId ?? "none"})`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
