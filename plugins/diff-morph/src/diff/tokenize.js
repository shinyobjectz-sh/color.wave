// tokenize — Shiki wrapper. Returns a flat array of tokens with
// stable keys: { id, text, kind, color, line, col }
//
// `kind` is a coarse classification derived from Shiki's style spans
// (keyword / string / comment / number / ident / punct / whitespace).
// We prefer Shiki's color tag when present; falling back to syntactic
// guesses keeps the diff stable across themes.

import { loadShiki } from "../shiki-loader.js";

export async function tokenize(text, language, theme = "github-dark") {
  const { highlighter } = await loadShiki();
  const lang = (highlighter.getLoadedLanguages?.() ?? []).includes(language) ? language : "javascript";
  const themed = highlighter.codeToTokens(text, { lang, theme });
  const out = [];
  let line = 0;
  for (const lineTokens of themed.tokens) {
    let col = 0;
    for (const tok of lineTokens) {
      const text = tok.content;
      const kind = classifyKind(text, tok.color);
      out.push({
        id: `${line}:${col}:${kind}:${text}`,
        text,
        kind,
        color: tok.color || "#fff",
        line,
        col,
      });
      col += text.length;
    }
    out.push({ id: `${line}:eol`, text: "\n", kind: "eol", color: "transparent", line, col });
    line++;
  }
  return out;
}

const KEYWORDS = new Set([
  "const","let","var","function","return","if","else","while","for","do",
  "switch","case","break","continue","class","extends","new","this","super",
  "import","export","default","from","as","async","await","yield","try","catch",
  "finally","throw","typeof","instanceof","void","null","undefined","true","false",
  "def","lambda","pass","print","not","and","or","is","in","raise","with","global",
  "nonlocal","fn","mut","pub","let","impl","trait","struct","enum","match","Self",
  "package","func","go","interface","type","map","range","var","defer","chan",
]);

function classifyKind(text, color) {
  if (/^\s+$/.test(text)) return "whitespace";
  if (/^[(){}\[\];,.:?]+$/.test(text)) return "punct";
  if (/^["'`]/.test(text)) return "string";
  if (/^\d/.test(text)) return "number";
  if (/^\/\/|^\/\*|^#/.test(text)) return "comment";
  if (KEYWORDS.has(text)) return "keyword";
  if (/^[A-Za-z_$][\w$]*$/.test(text)) return "ident";
  return "other";
}
