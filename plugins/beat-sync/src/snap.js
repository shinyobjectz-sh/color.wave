// snap — for each clip, find its nearest beat within tolerance,
// rewrite data-start. Symmetric tolerance window; clip duration preserved.
//
// Returns { html, snapped: [{ id, from, to }] }.

export function snapClipsToBeats(html, beats, tolMs = 60) {
  if (!beats.length) return { html, snapped: [] };
  const sorted = beats.slice().sort((a, b) => a.t - b.t);
  const tolS = tolMs / 1000;
  const snapped = [];
  // Match every <video|audio|img|div…> with data-start.
  const next = html.replace(/<([a-z][a-z0-9]*)\b([^>]*\sdata-start=)"([^"]+)"([^>]*)>/gi, (full, tag, pre, startStr, post) => {
    const start = parseFloat(startStr);
    if (!Number.isFinite(start)) return full;
    const beat = nearestBeat(sorted, start);
    if (!beat) return full;
    if (Math.abs(beat.t - start) > tolS) return full;
    snapped.push({ from: start, to: beat.t });
    return `<${tag}${pre}"${beat.t.toFixed(3)}"${post}>`;
  });
  return { html: next, snapped };
}

function nearestBeat(sorted, t) {
  // Binary search for the first beat >= t, then compare to its predecessor.
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const cands = [];
  if (lo > 0) cands.push(sorted[lo - 1]);
  if (lo < sorted.length) cands.push(sorted[lo]);
  if (!cands.length) return null;
  return cands.reduce((a, b) => (Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b));
}
