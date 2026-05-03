---
name: effects
description: Add agent-generated parametric controls (knobs, sliders, toggles) to the user's composition that hot-swap on change. Use whenever the user wants to tweak something later — colors, sizes, copy, visibility — without you re-editing the HTML each time.
---

# Effects

An **effect** is a knob in the user's "Effects" panel. You create it once; the user can change its value any time and the composition updates live. Effects ride inside the workbook file, so when the user shares the .workbook.html the recipient gets the same controls already wired to the same elements.

## When to create an effect

Reach for `effect_create` whenever the user says any of:

- "let me change X later"
- "I want to test different Y"
- "give me a knob / slider / toggle for Z"
- "make this swappable"

Also create one **proactively** when you've just authored a composition and there's an obvious recolor / resize / re-copy axis the user is likely to want to play with. Don't ask permission for one or two; ask before adding more than four at a time.

## Tool surface

| Tool | When |
|---|---|
| `effect_create({ name, description?, control, bindings })` | Add a new knob. |
| `effect_update({ id, value? | name? | control? | bindings? })` | Change a value, rename, retarget. Common case: programmatically nudge a value as part of an edit. |
| `effect_delete({ id })` | Remove a knob. |
| `effect_list()` | Read what's already there before adding more. **Always call this first** if the user says "the X knob" or "the existing slider" — never blind-create a duplicate. |

## Control schema

`control.kind` decides the panel UI:

- **color** — color picker. `default` is `#rrggbb`.
- **number** — slider. `default`, `min`, `max`, `step`.
- **text** — single-line input. `default`, `placeholder?`.
- **select** — dropdown. `options: [{ value, label? }]`, `default`.
- **boolean** — on/off toggle. `default: true | false`.

## Binding schema

`bindings` is an array — one effect can update many places at once. Four kinds:

| `kind` | What it does | Required fields |
|---|---|---|
| `css-property` | `selector { property: value }` | `selector`, `property` |
| `css-variable` | `:root { --name: value }` (use any selector to scope) | `property` (the `--name`) |
| `attribute` | `el.setAttribute(property, value)` for every element matching selector | `selector`, `property` |
| `text-content` | `el.textContent = value` for every element matching selector | `selector` |

## Patterns

### Pattern 1 — recolor a section
```
effect_create({
  name: "Hero accent",
  description: "Background color of the hero block",
  control: { kind: "color", label: "Color", default: "#ff6b6b" },
  bindings: [{ kind: "css-property", selector: ".hero", property: "background-color" }]
})
```

### Pattern 2 — drive multiple selectors from one knob
Use a CSS variable and have the composition reference it:

1. **In the composition source:** `.hero { background: var(--cw-accent, #ff6b6b); } .badge { color: var(--cw-accent, #ff6b6b); }`
2. **Effect:**
```
effect_create({
  name: "Brand color",
  control: { kind: "color", label: "Brand", default: "#ff6b6b" },
  bindings: [{ kind: "css-variable", selector: ":root", property: "--cw-accent" }]
})
```
One value, both elements update.

### Pattern 3 — number knob with units
CSS values are emitted bare. For a font-size in px, write the number into a CSS variable and let the composition append `px`:

1. **In CSS:** `h1.tagline { font-size: calc(var(--tagline-size, 48) * 1px); }`
2. **Effect:**
```
effect_create({
  name: "Tagline size",
  control: { kind: "number", label: "Size", default: 48, min: 16, max: 120, step: 1 },
  bindings: [{ kind: "css-variable", selector: ":root", property: "--tagline-size" }]
})
```

### Pattern 4 — visibility toggle
Use a `select` (not a boolean) when the binding is a CSS keyword:

```
effect_create({
  name: "Subtitle",
  control: {
    kind: "select",
    label: "Show subtitle",
    default: "block",
    options: [{ value: "block", label: "Show" }, { value: "none", label: "Hide" }],
  },
  bindings: [{ kind: "css-property", selector: ".subtitle", property: "display" }]
})
```

### Pattern 5 — swap copy
```
effect_create({
  name: "Headline copy",
  control: { kind: "text", label: "Headline", default: "Hello, world." },
  bindings: [{ kind: "text-content", selector: "h1.headline" }]
})
```

### Pattern 6 — swap an asset attribute
```
effect_create({
  name: "Hero alt-text",
  control: { kind: "text", label: "Alt", default: "" },
  bindings: [{ kind: "attribute", selector: "img.hero", property: "alt" }]
})
```

## Naming + descriptions

- **Names** are short and human ("Hero accent", "Tagline size", not "Effect 1" or "css-prop-binding-color").
- **Descriptions** explain *what changes* so the user can read the panel without seeing the composition. Skip the description if the name is self-explanatory.

## Don't

- Don't create one effect per element when one CSS variable would drive all of them.
- Don't create overlapping effects that fight each other (two `color` controls on the same selector).
- Don't bind to selectors you didn't author or don't see in the composition source — `effect_list()` to recall what's there, or read the composition first.
- Don't use boolean for visibility — use `select` with `block` / `none` (booleans serialize as `1`/`0`, which means nothing to CSS).
