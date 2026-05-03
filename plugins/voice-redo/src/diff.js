// diff — compare two transcript word arrays for "same / different".
//
// Emits stats only — splice mode is v0.2 work. v0.1 just decides:
// is the edit small enough to call "spot fix" (and should we warn
// about quality), or has the user rewritten the whole take?

export function transcriptDiff(originalWords, editedText) {
  const editedWords = (editedText || "").split(/\s+/).filter(Boolean);
  const a = originalWords.map((w) => w.w.toLowerCase().replace(/[^\w']/g, ""));
  const b = editedWords.map((w) => w.toLowerCase().replace(/[^\w']/g, ""));
  // LCS length for "kept" word count.
  const lcs = lcsLen(a, b);
  const kept = lcs;
  const inserted = b.length - kept;
  const removed = a.length - kept;
  return { originalLen: a.length, editedLen: b.length, kept, inserted, removed };
}

function lcsLen(a, b) {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return 0;
  const prev = new Int32Array(m + 1);
  const curr = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    prev.set(curr);
  }
  return prev[m];
}
