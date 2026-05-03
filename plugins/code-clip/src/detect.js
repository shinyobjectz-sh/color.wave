// detect — language guess from filename / first-line shebang.
//
// Falls back to "typescript" because that's the curated default and
// covers JS too with negligible loss.

const EXT_MAP = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  json: "json",
  html: "html", htm: "html",
  css: "css",
  sql: "sql",
};

const SHEBANG_MAP = {
  python: "python",
  python3: "python",
  node: "javascript",
  bun: "javascript",
};

export function detectLanguage(filename, source) {
  if (filename) {
    const m = filename.match(/\.([a-zA-Z0-9]+)$/);
    if (m && EXT_MAP[m[1].toLowerCase()]) return EXT_MAP[m[1].toLowerCase()];
  }
  if (source) {
    const first = source.split("\n", 1)[0] ?? "";
    const sh = first.match(/#!.*?\/(\w+)$/);
    if (sh && SHEBANG_MAP[sh[1]]) return SHEBANG_MAP[sh[1]];
    if (/^(def |import |from .* import |class .*:)/m.test(source)) return "python";
    if (/\bfn\s+\w+\s*\(/.test(source)) return "rust";
    if (/^package\s+\w+/m.test(source) && /\bfunc\s+\w+\(/.test(source)) return "go";
  }
  return "typescript";
}
