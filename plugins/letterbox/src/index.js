// letterbox — cinematic bars + vignette pulse.
//
// HOW IT WORKS
// - Render decorator wraps the composition with a fixed-position overlay
//   carrying two bars + a vignette layer (all pointer-events:none).
// - Bars open/close via a CSS transition tied to a `.is-open` class
//   that a tiny inline runtime toggles based on playback time. No GSAP
//   needed — CSS transitions cover the cinematic ease curve cleanly.
// - Vignette alpha mixes in `--cw-beat-flash`, so when beat-sync is
//   installed the vignette pulses on every beat. When beat-sync is
//   absent, the var stays 0 and the vignette is static.
// - 5 ratios: off / 2.39:1 / 2.20:1 / 1.85:1 / 4:3 (pillarbox).
// - Smallest plugin in the lineup. Pure CSS, no ML, no permissions.

import { RATIOS, findRatio, DEFAULT_RATIO_ID } from "./presets.js";
import { decorate } from "./decorator.js";
import { mountSettings } from "./settings.js";

export const manifest = {
  id: "letterbox",
  name: "Letterbox",
  version: "0.1.0",
  description: "Cinematic bars + vignette pulse. Composes with beat-sync via the cw:beat / --cw-beat-flash contract.",
  icon: "▭",
  surfaces: ["composition-decorators", "settings", "agent-tools"],
  permissions: [],
};

const DEFAULTS = {
  enabled: false,
  ratioId: DEFAULT_RATIO_ID,
  barColor: "#000",
  vignettePct: 35,
  openCloseS: 0.6,
  easing: "cubic-bezier(0.77,0,0.175,1)",
  openOnClip: true,
  pulseOnBeat: true,
};

export async function onActivate(wb) {
  let state = wb.storage.get("state") ?? { ...DEFAULTS };
  let panel = null;

  // ── render decorator ──────────────────────────────────────────────
  wb.composition.addRenderDecorator({
    priority: 220, // run after palette-swap (100) and colorgrade (200)
    transform(html) {
      return decorate(html, state);
    },
  });

  // ── settings ──────────────────────────────────────────────────────
  wb.settings.addSection({
    label: "Letterbox",
    mount(root) {
      panel = mountSettings(root, {
        getState: () => state,
        async setState(next) {
          state = next;
          await wb.storage.set("state", state);
          await wb.composition.repaint();
        },
      });
      return () => { panel?.destroy(); panel = null; };
    },
  });

  // ── agent tool ────────────────────────────────────────────────────
  wb.agent.registerTool({
    definition: {
      name: "letterbox",
      description: "Apply cinematic letterbox bars + optional vignette pulse to the composition.",
      parameters: {
        type: "object",
        properties: {
          ratio: { type: "string", enum: RATIOS.map((r) => r.id), description: "off / 239 / 220 / 185 / 43" },
          vignette_pct: { type: "number", minimum: 0, maximum: 100 },
          open_close_s: { type: "number", minimum: 0.2, maximum: 1.5 },
          pulse_on_beat: { type: "boolean" },
          enabled: { type: "boolean" },
        },
      },
    },
    async invoke({ ratio, vignette_pct, open_close_s, pulse_on_beat, enabled }) {
      const next = { ...state };
      if (ratio) {
        const r = findRatio(ratio);
        if (!r) throw new Error(`unknown ratio: ${ratio}`);
        next.ratioId = r.id;
        if (r.id !== "off") next.enabled = true;
      }
      if (typeof vignette_pct === "number") next.vignettePct = Math.max(0, Math.min(100, vignette_pct));
      if (typeof open_close_s === "number") next.openCloseS = Math.max(0.2, Math.min(1.5, open_close_s));
      if (typeof pulse_on_beat === "boolean") next.pulseOnBeat = pulse_on_beat;
      if (typeof enabled === "boolean") next.enabled = enabled;
      state = next;
      await wb.storage.set("state", state);
      panel?.onStateChange(state);
      await wb.composition.repaint();
      return JSON.stringify({ ok: true, state });
    },
  });

  if (state.enabled) {
    queueMicrotask(() => wb.composition.repaint());
  }

  wb.log(`letterbox activated (enabled=${state.enabled}, ratio=${state.ratioId})`);
}
