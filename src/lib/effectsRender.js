// effectsRender — turn the effects list into a single <style> block
// + a tiny inline runtime that applies non-CSS bindings (attribute,
// text-content) inside the iframe.
//
// Called from composition.svelte.js:buildSrcdoc().
//
// Output is one chunk of HTML appended after the composition body and
// before the iframe runtime. Empty list → empty string.
//
// Trust model. Effect metadata (selectors, property names) comes from
// the agent, value comes from the user via the panel control. The
// iframe is already sandboxed and runs whatever the agent wrote into
// composition.html, so the marginal trust risk from effects is low —
// but the v0.1 store + render path still validates everything we
// interpolate so a malformed value can't escape the <style> block,
// silently corrupt other rules, or smuggle an event handler through
// an attribute binding. Rejected entries skip silently (logged to
// console) rather than failing the whole srcdoc build.

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
        case "css-property": {
          const sel = safeSelector(b.selector);
          const prop = safeCssProp(b.property);
          if (!sel || !prop) { warn("css-property: bad selector/property", b); continue; }
          cssRules.push(`${sel} { ${prop}: ${cssValue(v)}; }`);
          break;
        }
        case "css-variable": {
          const sel = safeSelector(b.selector || ":root");
          const prop = safeCssVar(b.property);
          if (!sel || !prop) { warn("css-variable: bad selector/property", b); continue; }
          cssRules.push(`${sel} { ${prop}: ${cssValue(v)}; }`);
          break;
        }
        case "attribute": {
          const sel = safeSelector(b.selector);
          const prop = safeAttrName(b.property);
          if (!sel || !prop) { warn("attribute: bad selector/property", b); continue; }
          runtimeOps.push({ kind: "attr", selector: sel, property: prop, value: v });
          break;
        }
        case "text-content": {
          const sel = safeSelector(b.selector);
          if (!sel) { warn("text-content: bad selector", b); continue; }
          runtimeOps.push({ kind: "text", selector: sel, value: v });
          break;
        }
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
    // Escape "</" sequences in the JSON payload so a value containing
    // "</script>" can't terminate the script tag early. Browsers parse
    // "<\/" identically inside a JS string literal.
    const json = JSON.stringify(runtimeOps).replace(/<\//g, "<\\/");
    out += `\n<script data-cw-effects>(${runtimeShim.toString()})(${json});</script>`;
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

// ── validators ─────────────────────────────────────────────────────

// CSS selectors are unbounded grammar; we use a permissive deny-list
// that catches characters which should never appear at the top level
// of a valid selector AND would break the <style> block or smuggle in
// a new rule. `}` ends the rule body, `<` opens a tag, `;` ends a
// declaration — none belong here. Multi-selector commas, attribute
// brackets, pseudo-class colons, etc., all stay legal.
function safeSelector(s) {
  if (typeof s !== "string") return null;
  if (s.length === 0 || s.length > 256) return null;
  if (/[<>}{;]/.test(s)) return null;
  return s;
}

// CSS property names — letters/digits/hyphens, no leading dash.
function safeCssProp(s) {
  if (typeof s !== "string") return null;
  if (!/^[-a-zA-Z][-a-zA-Z0-9]*$/.test(s)) return null;
  return s;
}

// CSS custom property names — must start with `--`.
function safeCssVar(s) {
  if (typeof s !== "string") return null;
  if (!/^--[-a-zA-Z][-a-zA-Z0-9]*$/.test(s)) return null;
  return s;
}

// HTML attribute names — letters/digits/hyphens, not starting with
// `on` (event handlers run code; setAttribute on those is XSS).
function safeAttrName(s) {
  if (typeof s !== "string") return null;
  if (!/^[a-zA-Z][-a-zA-Z0-9_:]*$/.test(s)) return null;
  if (/^on/i.test(s)) return null;
  return s;
}

// Quote text values for css-property / css-variable bindings; numbers
// and colors pass through bare. Mostly for `text` controls bound to
// `content:` or `font-family:` where unquoted text breaks parsing.
// Any "</" sequence is escaped so values can't terminate the <style>
// tag (browsers happily parse "<\/" inside a CSS string).
function cssValue(v) {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  let s = String(v);
  // Hex / rgb / hsl / oklch / numeric-with-unit / functions (var(), calc(),
  // url()) all pass through. Strings that look like font-family names need
  // quoting if they contain spaces.
  let out;
  if (/^(#|rgb|hsl|oklch|var|calc|url|[\d.+-])/.test(s)) out = s;
  else if (/\s/.test(s) && !/['"]/.test(s)) out = JSON.stringify(s);
  else out = s;
  return out.replace(/<\//g, "<\\/");
}

function warn(msg, ctx) {
  if (typeof console !== "undefined" && console.warn) {
    console.warn(`[effects] ${msg}`, ctx);
  }
}
