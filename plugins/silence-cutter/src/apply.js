// apply — write the computed cut list into the composition HTML.
//
// Strategy: don't fragment the clip into N pieces. Instead, attach a
// `data-cuts` attribute to the matching <video>/<audio> element and
// rely on the lazy-injected runtime adapter (see runtime.js, registered
// as a render decorator on activation) to skip through drops at play
// time.
//
// The cuts attribute is JSON: [{drop:[t0,t1],xfade:msNumber}, …]
//
// Selection: the timeline clip action passes a clip identifier shape
// determined by colorwave's timeline parser (`data-start` / `data-duration`).
// We match by the first <video data-start="..." data-duration="..."> whose
// numbers fit; v0.1 trusts the caller to disambiguate.

/**
 * Mutate the composition HTML so the chosen clip carries a data-cuts
 * attribute encoding `cuts`. Returns the new HTML string.
 *
 * Idempotent: replaces any existing data-cuts on that element.
 */
export function applyCutsToClip(html, clipMatcher, cuts) {
  const json = JSON.stringify(
    cuts.map((c) => ({ drop: c.drop, xfade: c.crossfadeMs ?? 0 })),
  );
  const tagRe = /<(video|audio)\b([^>]*)>/gi;
  let mutated = false;
  const out = html.replace(tagRe, (full, tag, attrs) => {
    if (mutated) return full;
    if (!clipMatcher(attrs)) return full;
    mutated = true;
    const cleaned = attrs.replace(/\sdata-cuts="[^"]*"/, "");
    return `<${tag}${cleaned} data-cuts='${escapeAttr(json)}'>`;
  });
  if (!mutated) {
    throw new Error("silence-cutter: no clip matched for cuts apply");
  }
  return out;
}

/**
 * Return a matcher that inspects an element's attribute string and
 * returns true if it matches the target clip's data-start/data-duration.
 */
export function makeClipMatcher({ start, duration }) {
  return (attrs) => {
    const s = pickAttr(attrs, "data-start");
    const d = pickAttr(attrs, "data-duration");
    if (s == null || d == null) return false;
    return approxEq(parseFloat(s), start) && approxEq(parseFloat(d), duration);
  };
}

function pickAttr(attrs, name) {
  const re = new RegExp(`\\s${name}="([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? m[1] : null;
}

function approxEq(a, b, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

function escapeAttr(s) {
  return String(s).replace(/'/g, "&#39;");
}

/**
 * The runtime adapter — injected as a string literal by the render
 * decorator so authored compositions don't need to import it. It
 * scans for [data-cuts], wraps a tiny scheduler that listens for
 * `timeupdate` and seeks past each drop with a webaudio gain ramp
 * for the crossfade.
 *
 * Kept separate from the build so it ships *inline as a string* in
 * the final composition HTML — that way the cuts work even if the
 * plugin is later uninstalled and someone shares the .workbook.html.
 */
export const RUNTIME_SHIM = `
(function(){
  const SHIM_KEY = "__cwSilenceCutterShim";
  if (window[SHIM_KEY]) return;
  window[SHIM_KEY] = true;
  function init(el){
    let cuts;
    try { cuts = JSON.parse(el.getAttribute("data-cuts") || "[]"); }
    catch(e){ console.warn("silence-cutter: bad data-cuts", e); return; }
    if (!cuts.length) return;
    cuts.sort((a,b)=>a.drop[0]-b.drop[0]);
    let ctx, gain, src;
    function ensureGraph(){
      if (gain) return;
      try {
        ctx = new (window.AudioContext||window.webkitAudioContext)();
        src = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        src.connect(gain).connect(ctx.destination);
      } catch(e){ /* MediaElementSource can only be created once per el */ }
    }
    el.addEventListener("timeupdate", () => {
      const t = el.currentTime;
      for (const c of cuts) {
        const [t0, t1] = c.drop;
        if (t >= t0 && t < t1) {
          ensureGraph();
          if (gain && c.xfade > 0) {
            const now = ctx.currentTime;
            const xs = c.xfade/1000;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + xs/2);
            gain.gain.linearRampToValueAtTime(1, now + xs);
          }
          el.currentTime = t1;
          return;
        }
      }
    });
  }
  function scan(){
    document.querySelectorAll("video[data-cuts],audio[data-cuts]").forEach(init);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else { scan(); }
})();
`;
