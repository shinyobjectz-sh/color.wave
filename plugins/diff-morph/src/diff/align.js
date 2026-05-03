// align — token-level diff via dynamic-programming LCS, with rename
// promotion so similar idents get text-tweened instead of replaced.
//
// Output: { ops: [{op, a?, b?}], stats: { kept, inserted, removed, renamed } }
//   op ∈ "keep" | "insert" | "remove" | "rename"

const RENAME_DISTANCE = 2;

export function alignTokens(tokensA, tokensB) {
  const a = tokensA.filter((t) => t.kind !== "whitespace" && t.kind !== "eol");
  const b = tokensB.filter((t) => t.kind !== "whitespace" && t.kind !== "eol");
  const ops = lcsDiff(a, b, equalToken);
  // Rename promotion: collapse adjacent (remove, insert) of same kind
  // and similar text into a "rename" pair.
  const promoted = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    const next = ops[i + 1];
    if (o.op === "remove" && next?.op === "insert"
        && o.a.kind === next.b.kind && o.a.kind === "ident"
        && editDistance(o.a.text, next.b.text) <= RENAME_DISTANCE) {
      promoted.push({ op: "rename", a: o.a, b: next.b });
      i++;
      continue;
    }
    promoted.push(o);
  }
  const stats = { kept: 0, inserted: 0, removed: 0, renamed: 0 };
  for (const o of promoted) stats[o.op === "keep" ? "kept" : o.op === "rename" ? "renamed" : o.op === "insert" ? "inserted" : "removed"]++;
  return { ops: promoted, stats };
}

function equalToken(a, b) {
  return a.kind === b.kind && a.text === b.text;
}

/**
 * Standard LCS-based diff. O(n·m) memory; fine for code snippets up to
 * a few thousand tokens. Larger inputs would need Hirschberg, defer.
 */
function lcsDiff(a, b, eq) {
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = eq(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { ops.push({ op: "keep", a: a[i], b: b[j] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ op: "remove", a: a[i] }); i++; }
    else                                     { ops.push({ op: "insert", b: b[j] }); j++; }
  }
  while (i < n) { ops.push({ op: "remove", a: a[i++] }); }
  while (j < m) { ops.push({ op: "insert", b: b[j++] }); }
  return ops;
}

function editDistance(a, b) {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}
