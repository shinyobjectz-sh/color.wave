// ingest — source text → tokenized + colored char list ready for compose.
//
// Output: chars: [{ text: char, color: hex }]
// Newlines are kept as their own chars so compose can insert <br>s.

import { loadShiki } from "./shiki-loader.js";

const MAX_CHARS = 2000;

export async function ingest(source, language, theme = "github-dark") {
  const trimmed = source.length > MAX_CHARS ? source.slice(0, MAX_CHARS) + "\n…\n" : source;
  const { highlighter } = await loadShiki();
  const lang = (highlighter.getLoadedLanguages?.() ?? []).includes(language) ? language : "javascript";
  const themed = highlighter.codeToTokens(trimmed, { lang, theme });
  const chars = [];
  for (const lineTokens of themed.tokens) {
    for (const tok of lineTokens) {
      const color = tok.color || "#fff";
      for (const ch of [...tok.content]) {
        chars.push({ text: ch, color });
      }
    }
    chars.push({ text: "\n", color: "transparent" });
  }
  return { chars, truncated: source.length > MAX_CHARS };
}
