// compose — tag the matching <video|img> element with data-bg-removed.

export function tagClip(html, clipMatcher, clipId) {
  const re = /<(video|img|audio)\b([^>]*)>/gi;
  let mutated = false;
  const out = html.replace(re, (full, tag, attrs) => {
    if (mutated) return full;
    if (!clipMatcher(attrs)) return full;
    mutated = true;
    const cleaned = attrs.replace(/\sdata-bg-removed="[^"]*"/, "");
    return `<${tag}${cleaned} data-bg-removed="${clipId}">`;
  });
  if (!mutated) throw new Error("bg-remove: no clip element matched");
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
