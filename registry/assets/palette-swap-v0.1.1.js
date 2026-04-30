// src/presets.js
var PRESETS = [
  {
    id: "neutral-dark",
    label: "Neutral Dark",
    swatches: ["#0f172a", "#f1f5f9", "#94a3b8", "#cbd5e1"],
    vars: {
      "--cw-bg": "#0f172a",
      "--cw-fg": "#f1f5f9",
      "--cw-mute": "#94a3b8",
      "--cw-accent": "#cbd5e1"
    }
  },
  {
    id: "neutral-light",
    label: "Neutral Light",
    swatches: ["#f8fafc", "#0f172a", "#475569", "#1e293b"],
    vars: {
      "--cw-bg": "#f8fafc",
      "--cw-fg": "#0f172a",
      "--cw-mute": "#475569",
      "--cw-accent": "#1e293b"
    }
  },
  {
    id: "rose-noir",
    label: "Rose Noir",
    swatches: ["#1c1917", "#fafaf9", "#a8a29e", "#f43f5e"],
    vars: {
      "--cw-bg": "#1c1917",
      "--cw-fg": "#fafaf9",
      "--cw-mute": "#a8a29e",
      "--cw-accent": "#f43f5e"
    }
  },
  {
    id: "amber-graphite",
    label: "Amber Graphite",
    swatches: ["#18181b", "#fafaf9", "#71717a", "#fbbf24"],
    vars: {
      "--cw-bg": "#18181b",
      "--cw-fg": "#fafaf9",
      "--cw-mute": "#71717a",
      "--cw-accent": "#fbbf24"
    }
  },
  {
    id: "ocean",
    label: "Ocean",
    swatches: ["#082f49", "#e0f2fe", "#7dd3fc", "#38bdf8"],
    vars: {
      "--cw-bg": "#082f49",
      "--cw-fg": "#e0f2fe",
      "--cw-mute": "#7dd3fc",
      "--cw-accent": "#38bdf8"
    }
  },
  {
    id: "forest",
    label: "Forest",
    swatches: ["#14532d", "#ecfccb", "#86efac", "#bef264"],
    vars: {
      "--cw-bg": "#14532d",
      "--cw-fg": "#ecfccb",
      "--cw-mute": "#86efac",
      "--cw-accent": "#bef264"
    }
  }
];
function findPreset(id) {
  return PRESETS.find((p) => p.id === id);
}

// src/index.js
var manifest = {
  id: "palette-swap",
  name: "Palette Swap",
  version: "0.1.1",
  description: "Recolor the entire composition with a one-click palette preset. Adds a Palette section to Settings.",
  icon: "\u{1F3A8}",
  surfaces: ["composition-decorators", "settings"],
  permissions: []
};
async function onActivate(wb) {
  let activeId = wb.storage.get("active") ?? null;
  wb.composition.addRenderDecorator({
    priority: 100,
    transform(html) {
      const preset = activeId ? findPreset(activeId) : null;
      if (!preset) return html;
      const cssDecls = Object.entries(preset.vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
      const styleBlock = `<style data-palette-swap="${preset.id}">
:root {
${cssDecls}
}
</style>
`;
      return styleBlock + html;
    }
  });
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
      return () => {
        root.innerHTML = "";
      };
    }
  });
  if (activeId) {
    queueMicrotask(() => wb.composition.repaint());
  }
  wb.log(`palette-swap activated (${PRESETS.length} presets, active=${activeId ?? "none"})`);
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export {
  manifest,
  onActivate
};
