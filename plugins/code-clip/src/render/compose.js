// compose — turn (highlighted tokens, schedule) into a self-contained
// clip HTML fragment.
//
// Each glyph gets a <span data-cw-i="N"> with the token's color. A small
// inline runtime reads the schedule, walks playhead time, and toggles
// `data-cw-revealed="1"` on each char as time crosses its scheduled
// stamp. CSS animates opacity from 0 to 1.
//
// A cursor is a fixed positioned <span> updated to the right edge of
// the latest revealed char's bounding rect.

export function composeClip({ chars, schedule, theme, cursorStyle, durationS, insertAt, clipId, filename }) {
  const N = chars.length;
  const scheduleArr = [];
  for (let i = 0; i < N; i++) scheduleArr.push(+schedule[i].toFixed(3));
  const charsHtml = chars.map((ch, i) => {
    if (ch.text === "\n") return `<br data-cw-i="${i}">`;
    const t = escapeHtml(ch.text);
    return `<span data-cw-i="${i}" style="color:${ch.color};">${t}</span>`;
  }).join("");

  return `<section class="cw-code-clip" data-cw-kind="code-clip" data-cw-clip-id="${clipId}" data-start="${insertAt.toFixed(3)}" data-duration="${durationS.toFixed(3)}" data-cw-filename="${escapeAttr(filename || "")}" style="position:absolute;inset:0;background:${theme.bg};color:${theme.fg};font:14px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:32px 40px;overflow:hidden;">
<style data-cw-clip-id="${clipId}">
.cw-code-clip[data-cw-clip-id="${clipId}"] [data-cw-i] { opacity: 0; transition: opacity 80ms linear; }
.cw-code-clip[data-cw-clip-id="${clipId}"] [data-cw-i][data-cw-revealed="1"] { opacity: 1; }
.cw-code-clip[data-cw-clip-id="${clipId}"] .cw-cursor { position: absolute; width: ${cursorStyle === "beam" ? "2px" : cursorStyle === "underscore" ? "0.6em" : "0.6em"}; height: ${cursorStyle === "underscore" ? "2px" : "1.2em"}; background: ${theme.cursor}; pointer-events: none; transform: translate3d(0,0,0); transition: transform 90ms ease; ${cursorStyle === "underscore" ? "" : "mix-blend-mode: difference;"} }
.cw-code-clip[data-cw-clip-id="${clipId}"] .cw-cursor.blink { animation: cw-cursor-blink 800ms steps(2) infinite; }
@keyframes cw-cursor-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
.cw-code-clip[data-cw-clip-id="${clipId}"] pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
</style>
<pre>${charsHtml}</pre>
<span class="cw-cursor blink" data-cw-cursor></span>
<script type="application/json" data-cw-schedule="${clipId}">${JSON.stringify(scheduleArr)}</script>
<script type="module" data-cw-clip-id="${clipId}">
${runtimeShim(clipId)}
</script>
</section>`;
}

function runtimeShim(clipId) {
  return `
const root = document.querySelector('.cw-code-clip[data-cw-clip-id="${clipId}"]');
if (root) {
  const sched = JSON.parse(document.querySelector('script[data-cw-schedule="${clipId}"]').textContent);
  const spans = Array.from(root.querySelectorAll('[data-cw-i]'));
  const cursor = root.querySelector('[data-cw-cursor]');
  const clipStart = parseFloat(root.getAttribute('data-start') || '0');
  let lastIdx = -1;
  function targetTime() {
    const v = document.querySelector('video,audio');
    return v ? v.currentTime - clipStart : (typeof window.cw?.time === 'number' ? window.cw.time - clipStart : performance.now() / 1000 - clipStart);
  }
  function tick() {
    const t = targetTime();
    // Binary search the largest i with sched[i] <= t.
    let lo = 0, hi = sched.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sched[mid] <= t) lo = mid + 1; else hi = mid;
    }
    const idx = lo - 1;
    if (idx !== lastIdx) {
      // Walk forward or backward to update reveal flags.
      if (idx > lastIdx) {
        for (let i = lastIdx + 1; i <= idx; i++) {
          const el = spans[i];
          if (el && el.dataset) el.dataset.cwRevealed = '1';
        }
      } else {
        for (let i = lastIdx; i > idx; i--) {
          const el = spans[i];
          if (el && el.dataset) el.dataset.cwRevealed = '0';
        }
      }
      lastIdx = idx;
      // Cursor: position at right edge of last revealed visible char.
      const last = idx >= 0 ? spans[idx] : null;
      if (cursor && last && last.getBoundingClientRect) {
        const r = last.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        cursor.style.transform = 'translate3d(' + (r.right - rr.left) + 'px,' + (r.top - rr.top) + 'px,0)';
        cursor.classList.toggle('blink', idx >= sched.length - 1);
      } else if (cursor && idx < 0) {
        cursor.style.transform = 'translate3d(0,0,0)';
      }
    }
    requestAnimationFrame(tick);
  }
  tick();
}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
