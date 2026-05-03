// colorgrade — reference-image grade match + curves panel.
//
// HOW IT WORKS
// - Settings section: drop a reference image, pick a preset, sculpt a
//   master tone curve, scrub a strength slider.
// - Render decorator emits a single :root --cg-filter and applies it
//   to body, so the entire composition surface (text, images, video,
//   CSS backgrounds) grades together. No NLE can do this.
// - Match algorithm fits CSS filter chain (brightness/contrast/saturate/
//   hue-rotate/sepia) to a reference image's color statistics. WebGL
//   Hald-LUT path is queued for v0.2.

import { PRESETS, findPreset, DEFAULT_PRESET_ID } from "./presets.js";
import { matchReference } from "./match.js";
import { decorate, buildFilterChain } from "./decorator.js";
import { mountSettings } from "./panel/mount.js";

export const manifest = {
  id: "colorgrade",
  name: "Colorgrade",
  version: "0.1.0",
  description: "Reference-image grade match + curves panel. Grades the whole composition surface, not just video tracks.",
  icon: "🎚",
  surfaces: ["composition-decorators", "settings", "agent-tools"],
  permissions: [],
};

const DEFAULT_STATE = {
  enabled: false,
  sourceKind: "preset",
  presetId: DEFAULT_PRESET_ID,
  baseFilter: findPreset(DEFAULT_PRESET_ID).filter,
  matchName: null,
  curve: { p1: { x: 0.25, y: 0.25 }, p2: { x: 0.75, y: 0.75 } }, // identity-ish
  strength: 100,
};

export async function onActivate(wb) {
  let state = wb.storage.get("state") ?? { ...DEFAULT_STATE };
  let panel = null;

  // ── render decorator ──────────────────────────────────────────────
  wb.composition.addRenderDecorator({
    priority: 200, // run after palette-swap (100) so palette colors get graded too
    transform(html) {
      return decorate(html, state);
    },
  });

  // ── settings ──────────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Color Grade",
    mount(root) {
      panel = mountSettings(root, {
        getState: () => state,
        async setState(next) {
          state = next;
          await wb.storage.set("state", state);
          await wb.composition.repaint();
        },
        async onMatchImage(file) {
          return await matchReference(file);
        },
      });
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "color_grade",
      description: "Apply a color grade to the entire composition. Pick a built-in preset or pass a CSS filter chain directly.",
      parameters: {
        type: "object",
        properties: {
          preset: { type: "string", enum: PRESETS.map((p) => p.id) },
          filter: { type: "string", description: "Custom CSS filter chain (e.g. 'brightness(1.1) contrast(1.05) hue-rotate(-6deg)'). Ignored if preset is set." },
          strength: { type: "number", minimum: 0, maximum: 100 },
          enabled: { type: "boolean" },
        },
      },
    },
    async invoke({ preset, filter, strength, enabled }) {
      const next = { ...state };
      if (typeof enabled === "boolean") next.enabled = enabled;
      if (preset) {
        const p = findPreset(preset);
        if (!p) throw new Error(`unknown preset: ${preset}`);
        next.sourceKind = "preset";
        next.presetId = p.id;
        next.baseFilter = p.filter;
        next.matchName = null;
        next.enabled = true;
      } else if (typeof filter === "string") {
        next.sourceKind = "custom";
        next.baseFilter = filter;
        next.presetId = null;
        next.matchName = "custom";
        next.enabled = true;
      }
      if (typeof strength === "number") next.strength = Math.max(0, Math.min(100, strength));
      state = next;
      await wb.storage.set("state", state);
      panel?.onStateChange(state);
      await wb.composition.repaint();
      return JSON.stringify({
        ok: true,
        state: { enabled: state.enabled, sourceKind: state.sourceKind, baseFilter: state.baseFilter, strength: state.strength },
        chain: buildFilterChain(state),
      });
    },
  });

  if (state.enabled) {
    queueMicrotask(() => wb.composition.repaint());
  }

  wb.log(`colorgrade activated (enabled=${state.enabled}, source=${state.sourceKind})`);
}
