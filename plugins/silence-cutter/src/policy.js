// policy — bezier curve + word timeline → cut list.
//
// Inputs:
//   words: [{ word, t_start, t_end, conf }] — Whisper word-level timestamps
//   curve: { p1: {x,y}, p2: {x,y}, attackMaxMs, decayMaxMs, crossfadeMaxMs }
//   opts:  { minSilenceMs, minKeepMs }
//
// Output:
//   cuts: [{ drop: [t0, t1], crossfadeMs }]  — closed intervals to drop
//
// The composition runtime adapter (apply.js) reads `data-cuts` on the
// <video>/<audio> element and skips through each drop with a webaudio
// gain crossfade of `crossfadeMs` straddling the boundary.

const MIN_SILENCE_MS_DEFAULT = 250;
const MIN_KEEP_MS_DEFAULT = 120;

/**
 * Group consecutive words into phrases, emit gaps as candidate silences.
 */
export function findSilences(words, opts = {}) {
  const minSilenceMs = opts.minSilenceMs ?? MIN_SILENCE_MS_DEFAULT;
  const silences = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    const gapMs = (b.t_start - a.t_end) * 1000;
    if (gapMs >= minSilenceMs) {
      silences.push({
        t_start: a.t_end,
        t_end: b.t_start,
        durMs: gapMs,
        leadingWord: a.word,
        trailingWord: b.word,
      });
    }
  }
  return silences;
}

/**
 * One bezier curve → per-silence drop interval.
 *
 * For each silence S of duration d:
 *   attack_pad   = curve.p1.x * min(d/2, attackMaxMs)
 *   decay_pad    = (1 - curve.p2.x) * min(d/2, decayMaxMs)
 *   crossfade    = depth * min(d, crossfadeMaxMs)
 *   drop_window  = [S.t_start + attack_pad, S.t_end - decay_pad]
 *
 * Skip windows that would shrink below minKeepMs (i.e. the drop is so
 * tight it isn't worth a cut — leaves the gap intact).
 */
export function computeCuts(words, curve, opts = {}) {
  const minKeepMs = opts.minKeepMs ?? MIN_KEEP_MS_DEFAULT;
  const silences = findSilences(words, opts);
  const depth = Math.max(curve.p1.y, 1 - curve.p2.y);
  const cuts = [];
  for (const s of silences) {
    const dMs = s.durMs;
    const attackPadMs = curve.p1.x * Math.min(dMs / 2, curve.attackMaxMs);
    const decayPadMs = (1 - curve.p2.x) * Math.min(dMs / 2, curve.decayMaxMs);
    const crossfadeMs = depth * Math.min(dMs, curve.crossfadeMaxMs);
    const dropStart = s.t_start + attackPadMs / 1000;
    const dropEnd = s.t_end - decayPadMs / 1000;
    const dropMs = (dropEnd - dropStart) * 1000;
    if (dropMs < minKeepMs) continue;
    cuts.push({
      drop: [round3(dropStart), round3(dropEnd)],
      crossfadeMs: Math.round(crossfadeMs),
    });
  }
  return cuts;
}

/**
 * Reduce a cut list to a final clip duration.
 */
export function totalKeptDuration(originalDurationS, cuts) {
  let droppedS = 0;
  for (const c of cuts) droppedS += c.drop[1] - c.drop[0];
  return Math.max(0, originalDurationS - droppedS);
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}
