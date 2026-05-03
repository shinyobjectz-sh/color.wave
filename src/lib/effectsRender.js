// effectsRender — turn the effects list into a single <style> block
// + a tiny inline runtime that applies non-CSS bindings (attribute,
// text-content) inside the iframe.
//
// Called from composition.svelte.js:buildSrcdoc().
//
// Output is one chunk of HTML appended after the composition body and
// before the iframe runtime. Empty list → empty string.
//
// CSS-property bindings:
//     [{kind:"css-property", selector:".hero", property:"background-color"}]
//   → .hero { background-color: <value>; }
//
// CSS-variable bindings (always emitted at :root for simplicity; a
// `selector` field is honored if the author wants a scoped variable):
//     [{kind:"css-variable", selector:":root",  property:"--accent"}]
//   → :root { --accent: <value>; }
//
// Attribute bindings — runtime sets element attributes on every element
// matching the selector:
//     [{kind:"attribute", selector:"[data-id=hero]", property:"title"}]
//   → script: querySelectorAll → setAttribute(property, value)
//
// Text-content bindings — runtime swaps textContent:
//     [{kind:"text-content", selector:"h1.tagline"}]
//   → script: querySelectorAll → textContent = value

export function renderEffects(items) {
  if (!items?.length) return "";
  const cssRules = [];
  const runtimeOps = [];
  for (const fx of items) {
    if (!fx?.bindings?.length) continue;
    const v = fx.value !== undefined ? fx.value : fx.control?.default;
    for (const b of fx.bindings) {
      if (!b?.kind) continue;
      switch (b.kind) {
        case "css-property":
          if (!b.selector || !b.property) continue;
          cssRules.push(`${b.selector} { ${b.property}: ${cssValue(v)}; }`);
          break;
        case "css-variable":
          if (!b.property) continue;
          cssRules.push(`${b.selector || ":root"} { ${b.property}: ${cssValue(v)}; }`);
          break;
        case "attribute":
          if (!b.selector || !b.property) continue;
          runtimeOps.push({ kind: "attr", selector: b.selector, property: b.property, value: v });
          break;
        case "text-content":
          if (!b.selector) continue;
          runtimeOps.push({ kind: "text", selector: b.selector, value: v });
          break;
        default:
          break;
      }
    }
  }
  let out = "";
  if (cssRules.length) {
    out += `<style data-cw-effects>\n${cssRules.join("\n")}\n</style>`;
  }
  if (runtimeOps.length) {
    out += `\n<script data-cw-effects>(${runtimeShim.toString()})(${JSON.stringify(runtimeOps)});</script>`;
  }
  return out;
}

// Inline runtime — receives the runtime ops + applies them once on
// load. Re-emitted on every srcdoc rebuild, so each value change runs
// a fresh script with the new ops list.
function runtimeShim(ops) {
  function apply() {
    for (const op of ops) {
      try {
        const els = document.querySelectorAll(op.selector);
        for (const el of els) {
          if (op.kind === "attr") el.setAttribute(op.property, String(op.value ?? ""));
          else if (op.kind === "text") el.textContent = String(op.value ?? "");
        }
      } catch (e) {
        console.warn("effects runtime op failed:", e?.message ?? e);
      }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
}

// Quote text values for css-property / css-variable bindings; numbers
// and colors pass through bare. Mostly for `text` controls bound to
// `content:` or `font-family:` where unquoted text breaks parsing.
function cssValue(v) {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = String(v);
  // Hex / rgb / hsl / oklch / numeric-with-unit / functions (var(), calc(),
  // url()) all pass through. Strings that look like font-family names need
  // quoting if they contain spaces.
  if (/^(#|rgb|hsl|oklch|var|calc|url|[\d.+-])/.test(s)) return s;
  if (/\s/.test(s) && !/['"]/.test(s)) return JSON.stringify(s);
  return s;
}
