// decorator — inject mask-image CSS on every clip with a stored mask.
//
// Image clips: single grayscale data-URL. CSS:
//   [data-bg-removed="<id>"] { mask-image: url(...); mask-mode: luminance; -webkit-mask-image: url(...); -webkit-mask-mode: luminance; }
//
// Video clips: sequence of N keyframe masks, swapped via @keyframes
// with `animation-timing-function: steps(N)` so each mask holds for
// 1/N of the duration. Each step references a different background-image
// in a sprite-style trick: we encode each mask as a separate CSS
// @property in a sequence and animate `mask-image` via custom property
// (Houdini @property pattern).
//
// For browsers without @property support, fall back to the first frame
// only (still useful — the subject just doesn't update).

export function decorate(html, entries) {
  if (!entries.length) return html;
  const blocks = [];
  for (const e of entries) {
    if (e.kind === "image") blocks.push(renderImage(e));
    else if (e.kind === "video") blocks.push(renderVideo(e));
  }
  if (!blocks.length) return html;
  return html + `\n<style data-cw-bgremove>\n${blocks.join("\n\n")}\n</style>\n`;
}

function renderImage(e) {
  return `[data-bg-removed="${e.clipId}"] {
  -webkit-mask-image: url("${e.dataUrl}");
  mask-image: url("${e.dataUrl}");
  -webkit-mask-mode: luminance;
  mask-mode: luminance;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}`;
}

function renderVideo(e) {
  const id = e.clipId;
  const frames = e.frames;
  const dur = e.durationS;
  const n = frames.length;
  if (n === 0) return "";
  if (n === 1) {
    return renderImage({ clipId: id, dataUrl: frames[0].dataUrl });
  }
  const animName = `bgr-${id}`;
  const keyframes = frames.map((f, i) => {
    const pct = ((i / (n - 1)) * 100).toFixed(2);
    return `  ${pct}% { mask-image: url("${f.dataUrl}"); -webkit-mask-image: url("${f.dataUrl}"); }`;
  }).join("\n");
  return `@keyframes ${animName} {
${keyframes}
}
[data-bg-removed="${id}"] {
  -webkit-mask-mode: luminance;
  mask-mode: luminance;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  animation: ${animName} ${dur.toFixed(3)}s steps(${n - 1}, end) both;
}`;
}
