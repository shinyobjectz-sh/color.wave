---
name: adjustments
description: Add time-anchored shader/filter passes (CRT, scanlines, glitch, VHS, film grain, color grade) to specific time windows of the user's composition. After Effects-style adjustment layers — they ride the timeline like clips and apply their look to whatever's playing during their window. Use when the user says "make this section feel like X", "add a CRT effect to the intro", "color-grade the chorus warmer", "glitch the drop", or names a built-in shader.
---

# Adjustment layers

A workbook **adjustment layer** is a shader/filter pass anchored to a time window. The composition's frame at time `t` is rendered THROUGH every adjustment layer whose `[start, start+duration]` window contains `t`. They ride the timeline as their own bars (After Effects model) and the user sees them stack visually below the clip lanes.

## When to create an adjustment layer

Reach for `adjustment_create` when the user says:

- "make this look like X" where X is a familiar visual style (CRT, VHS, film, glitch)
- "add a {shader} effect to {section}"
- "color-grade {section} warmer / cooler / more saturated / more contrast"
- "glitch the drop" / "scanlines on the title" / "grain over the b-roll"
- "feels too clean — add some texture"

Don't reach for adjustment layers when:

- The user wants a knob to tweak later that targets a SPECIFIC element → that's `effect_create` (parametric controls bound to one selector)
- The user wants new content (text, image, video clip) → that's a clip
- The user wants a transition between scenes → that's a shader transition (different system, in `@hyperframes/shader-transitions`)

The mental model: **clips are content, effects are knobs, adjustment layers are looks**.

## Tool surface

| Tool | When |
|---|---|
| `adjustment_create({ shader, start, duration, params })` | Add a new adjustment layer. Required: `shader`, `start`, `duration`. |
| `adjustment_update({ id, ...patch })` | Patch a layer. `params` MERGES (doesn't replace) so partial updates are safe. |
| `adjustment_delete({ id })` | Remove a layer. |
| `adjustment_list()` | Read current layers. **Always call first** when the user references "the existing X layer" so you don't duplicate. |

## Built-in shader catalog

Six shaders ship with the runtime. Each has its own `params` object — only specify the keys you want to override; missing keys use defaults.

### `crt` — old-TV scanlines + RGB phosphor shift

The retro CRT workhorse. Use for VHS-era / 80s computer / arcade vibes.

```js
adjustment_create({
  shader: "crt",
  start: 0, duration: 4,
  params: {
    scanlineIntensity: 0.4,    // 0..1, default 0.4
    rgbShift: 1.5,             // px, 0..8, default 1.5
    blur: 0.6,                 // 0..3, default 0.6
  },
})
```

### `scanlines` — subtle horizontal noise

Like `crt` minus the RGB shift. For "monitor capture" / "filmic" without going full retro.

```js
params: {
  intensity: 0.25,             // 0..1, default 0.25
  density: 0.5,                // 0.1..1, default 0.5
}
```

### `glitch` — chromatic aberration + jitter

Use SPARINGLY — looks great on beat drops and intros, fatiguing if held too long. Default duration <2s.

```js
params: {
  shift: 4,                    // px, 0..12, default 4
  jitter: 2,                   // displacement, 0..10, default 2
}
```

### `vhs` — warm tint + scanlines + soft edges

Home-tape recording look. Good for "found footage" / "memory" sections.

```js
params: {
  warmth: 0.6,                 // 0..1, default 0.6
  scanlines: 0.3,              // 0..1, default 0.3
  softness: 0.8,               // 0..2, default 0.8
}
```

### `grain` — fractal-noise overlay

Film grain. Pair with `colorgrade` for a "shot on 16mm" feel.

```js
params: {
  intensity: 0.18,             // 0..1, default 0.18
  size: 0.9,                   // 0.1..3, default 0.9
}
```

### `colorgrade` — saturation, hue, contrast

The "make it cinematic" knob set. Often the only adjustment layer you need.

```js
params: {
  saturation: 1.1,             // 0..2, default 1.0
  hue: 8,                      // -180..180 degrees, default 0
  contrast: 1.05,              // 0.5..2, default 1.0
}
```

## Composition rules

- **Multiple layers stack via filter chain** (CSS `filter: url(#a) url(#b) url(#c)`). Order = lower `trackIndex` applied first. The user sees this on the timeline as bars in different rows.
- **Per-layer track index** is auto-assigned to `100` (the base) by default. Pass an explicit `trackIndex` ≥100 for stacking control. Don't pass <100 — those are clip lanes; the runtime clamps automatically but it's confusing.
- **Default duration**: cover the section the user named. If they don't say where, ask before creating a layer that covers the whole composition — `colorgrade` over the whole thing is usually fine, but `glitch` over the whole thing is annoying.
- **Don't duplicate**: call `adjustment_list()` first if the user says "the CRT layer". Two CRT layers covering the same window stack and look wrong.

## Examples

### CRT effect on the intro

```js
// User: "give the intro that retro CRT feel for the first 4 seconds"
adjustment_create({
  shader: "crt",
  start: 0,
  duration: 4,
  label: "Intro CRT",
  params: { scanlineIntensity: 0.5, rgbShift: 2.5 },
})
```

### Glitch on the beat drop (assume drop at t=8s, ~1.5s long)

```js
adjustment_create({
  shader: "glitch",
  start: 8,
  duration: 1.5,
  label: "Drop glitch",
  params: { shift: 6, jitter: 4 },
})
```

### Whole-composition warm color grade + film grain

```js
const total = composition.totalDuration;          // read from context
adjustment_create({
  shader: "colorgrade",
  start: 0, duration: total,
  trackIndex: 100,                                  // applied first
  params: { saturation: 1.05, hue: 6, contrast: 1.05 },
});
adjustment_create({
  shader: "grain",
  start: 0, duration: total,
  trackIndex: 101,                                  // grain on top of grade
  params: { intensity: 0.15, size: 0.8 },
});
```

### Tweaking an existing layer's params

```js
// User: "the CRT is too strong, dial it back"
const layers = JSON.parse(await adjustment_list());
const crt = layers.find((l) => l.shader === "crt");
adjustment_update({ id: crt.id, params: { scanlineIntensity: 0.2, rgbShift: 1 } });
// Note: params MERGES — blur stays at whatever it was.
```

### Removing a layer

```js
const layers = JSON.parse(await adjustment_list());
const grade = layers.find((l) => l.shader === "colorgrade");
adjustment_delete({ id: grade.id });
```

## Implementation notes (for agents inspecting source)

- Store: `wb.collection("adjustments")` — round-trips through the workbook file like effects + assets, persisted on Cmd+S.
- Render: `src/lib/adjustmentsRender.js` builds an SVG `<defs>` block with one `<filter>` per layer + a tiny inline runtime that swaps `body.style.filter` based on the playhead. SVG filters compose natively.
- Timeline: `src/components/Timeline.svelte` renders adjustment bars below the clip lanes with dashed border + accent tint to read as "look layer" not "content".
- Shader catalog: `SHADER_CATALOG` export in `adjustmentsRender.js` — each entry has `{ label, description, params: { name: { kind, min, max, default, label } }, svgFilter(id, params) }`. Adding a new shader = adding an entry there + a card to this skill.
- Time-window logic runs INSIDE the iframe (driven by `tick` postMessages), so layers compose without the outer Player needing per-frame work.
