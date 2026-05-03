// shiki-loader — shared lazy-load that resolves to a single instance
// per host page. First plugin to activate pays the network cost; later
// plugins (e.g. code-clip) hit globalThis cache.
//
// IMPORTANT: this 12-line block is duplicated verbatim across diff-morph
// and code-clip. Edit both copies in lockstep when changing the contract
// (cache key, version pin).

const SHIKI_CDN = "https://esm.sh/shiki@1.22.2";
const CACHE_KEY = "__cw_shiki_v1";

export async function loadShiki() {
  const existing = globalThis[CACHE_KEY];
  if (existing) return await existing;
  const promise = (async () => {
    const mod = await import(/* @vite-ignore */ /* webpackIgnore: true */ SHIKI_CDN);
    const highlighter = await mod.createHighlighter({
      themes: ["github-dark", "github-light", "vitesse-dark"],
      langs: ["typescript", "javascript", "python", "rust", "go", "json", "html", "css", "sql"],
    });
    return { mod, highlighter };
  })();
  globalThis[CACHE_KEY] = promise;
  return await promise;
}
