// compose — composition mutation: tag the target <video> with
// data-smart-reframe="<clipId>" so the render-decorator's CSS hooks it.
//
// Idempotent: replaces any existing data-smart-reframe attribute on
// the matched element.

export function tagVideo(html, clipMatcher, clipId) {
  const re = /<(video)\b([^>]*)>/gi;
  let mutated = false;
  const out = html.replace(re, (full, tag, attrs) => {
    if (mutated) return full;
    if (!clipMatcher(attrs)) return full;
    mutated = true;
    const cleaned = attrs.replace(/\sdata-smart-reframe="[^"]*"/, "");
    return `<${tag}${cleaned} data-smart-reframe="${clipId}">`;
  });
  if (!mutated) throw new Error("smart-reframe: no <video> matched");
  return out;
}

export function makeClipMatcher({ start, duration }) {
  return (attrs) => {
    const s = parseFloat(pickAttr(attrs, "data-start"));
    const d = parseFloat(pickAttr(attrs, "data-duration"));
    return Number.isFinite(s) && Number.isFinite(d)
      && Math.abs(s - start) < 0.01 && Math.abs(d - duration) < 0.01;
  };
}

function pickAttr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}
