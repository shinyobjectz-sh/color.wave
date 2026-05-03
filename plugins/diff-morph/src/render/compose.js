// compose — turn aligned diff ops into a self-contained HTML clip.
//
// Output is a single <div data-cw-diff-morph> with embedded <style>
// (Shiki theme tokens) and <script type="module"> that constructs a
// GSAP timeline animating: removes dissolve → kept slide via FLIP →
// inserts wipe in.
//
// The clip is timeline-aware: it carries data-start and data-duration
// so the colorwave timeline parser picks it up like any other clip.

const GSAP_VERSION = "3.12.5";

export function composeClip({ ops, before, after, language, theme, durationS, insertAt, clipId }) {
  // Build "stage A" (before) and "stage B" (after) DOM serializations.
  // Each token gets a data-tok-id so the timeline can find it.
  const stageBHtml = buildStageHtml(ops.flatMap((o) => o.op === "keep" || o.op === "rename" || o.op === "insert" ? [o.op === "insert" ? { ...o.b, _state: "insert" } : { ...(o.b || o.a), _state: o.op }] : []), clipId, "B");
  const stageAHtml = buildStageHtml(ops.flatMap((o) => o.op === "keep" || o.op === "rename" || o.op === "remove" ? [o.op === "remove" ? { ...o.a, _state: "remove" } : { ...o.a, _state: o.op }] : []), clipId, "A");
  const tlBody = buildTimeline(ops, clipId, durationS);

  const safeBefore = escapeAttr(before);
  const safeAfter = escapeAttr(after);

  return `<div class="cw-diff-morph" data-cw-diff-morph="${clipId}" data-start="${insertAt.toFixed(3)}" data-duration="${durationS.toFixed(3)}" data-before="${safeBefore}" data-after="${safeAfter}" data-language="${language}" data-theme="${theme}" style="position:absolute;inset:0;font:14px/1.5 ui-monospace,Menlo,monospace;">
<pre class="cw-dm-stage" data-stage="A">${stageAHtml}</pre>
<pre class="cw-dm-stage cw-dm-after" data-stage="B" style="display:none;">${stageBHtml}</pre>
<style data-cw-diff-morph="${clipId}">
.cw-diff-morph .cw-dm-stage { margin: 0; padding: 24px 32px; background: #0f1117; color: #e7e9ee; min-height: 100%; }
.cw-diff-morph .cw-dm-stage pre, .cw-diff-morph .cw-dm-stage { white-space: pre; }
.cw-diff-morph [data-cw-tok] { display: inline-block; will-change: transform, opacity; transform-origin: 0 0; }
.cw-diff-morph [data-cw-tok][data-state="remove"] { opacity: 1; }
.cw-diff-morph [data-cw-tok][data-state="insert"] { opacity: 0; clip-path: inset(0 100% 0 0); }
.cw-diff-morph [data-cw-tok][data-state="rename"] { opacity: 1; }
</style>
<script type="module" data-cw-diff-morph="${clipId}">
${tlBody}
</script>
</div>`;
}

function buildStageHtml(tokens, clipId, stage) {
  // Tokens carry whitespace/newlines literally as data-tok="ws" entries
  // — we re-introduce a simple newline split here based on .text.
  return tokens.map((t, i) => {
    const id = `${clipId}-${stage}-${i}-${t.kind}`;
    const txt = escapeHtml(t.text);
    const stateAttr = ` data-state="${t._state}"`;
    return `<span data-cw-tok="${id}" data-kind="${t.kind}" data-text="${escapeAttr(t.text)}" data-color="${t.color}" style="color:${t.color};"${stateAttr}>${txt}</span>`;
  }).join("");
}

function buildTimeline(ops, clipId, durationS) {
  // Phases: 0 .. 0.30 dissolve removes; 0.30 .. 0.60 FLIP kept; 0.55 .. 1.0 wipe inserts.
  const dur = durationS;
  const removePhase = Math.max(0.18, dur * 0.30);
  const flipPhase = Math.max(0.20, dur * 0.30);
  const insertPhase = Math.max(0.25, dur * 0.40);
  return `
import { gsap } from "https://esm.sh/gsap@${GSAP_VERSION}";
const root = document.querySelector('[data-cw-diff-morph="${clipId}"]');
if (root) {
  const stageA = root.querySelector('[data-stage="A"]');
  const stageB = root.querySelector('[data-stage="B"]');
  // Capture FIRST positions of "kept"/"rename" tokens in stage A.
  const firsts = new Map();
  for (const el of stageA.querySelectorAll('[data-cw-tok][data-state="keep"], [data-cw-tok][data-state="rename"]')) {
    firsts.set(el.dataset.text + ':' + el.dataset.kind + ':' + el.dataset.cwTok.split('-').slice(-2)[1], el.getBoundingClientRect());
  }
  const tl = gsap.timeline({ paused: true });
  // Phase 1: dissolve removes
  tl.to(stageA.querySelectorAll('[data-state="remove"]'), {
    autoAlpha: 0, filter: 'blur(4px)', duration: ${removePhase.toFixed(3)}, stagger: 0.01, ease: 'power2.in'
  }, 0);
  // Phase 2: swap A→B at midpoint, then FLIP kept tokens.
  tl.add(() => { stageA.style.display = 'none'; stageB.style.display = ''; }, ${removePhase.toFixed(3)});
  tl.add(() => {
    const lasts = new Map();
    for (const el of stageB.querySelectorAll('[data-state="keep"], [data-state="rename"]')) {
      const key = el.dataset.text + ':' + el.dataset.kind + ':' + el.dataset.cwTok.split('-').slice(-2)[1];
      const last = el.getBoundingClientRect();
      const first = firsts.get(key);
      if (first) {
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        gsap.fromTo(el, { x: dx, y: dy }, { x: 0, y: 0, duration: ${flipPhase.toFixed(3)}, ease: 'power2.inOut' });
      }
    }
  }, ${removePhase.toFixed(3)});
  // Phase 3: wipe inserts.
  tl.fromTo(stageB.querySelectorAll('[data-state="insert"]'), {
    autoAlpha: 0, clipPath: 'inset(0 100% 0 0)'
  }, {
    autoAlpha: 1, clipPath: 'inset(0 0% 0 0)', duration: ${insertPhase.toFixed(3)}, stagger: 0.012, ease: 'power2.out'
  }, ${(removePhase + flipPhase).toFixed(3)});
  // Drive timeline from playhead.
  function tick() {
    const v = document.querySelector('video,audio');
    const t = v ? v.currentTime : (typeof window.cw?.time === 'number' ? window.cw.time : performance.now() / 1000);
    const clipStart = ${ops.length ? 0 : 0};
    tl.seek(Math.max(0, Math.min(tl.duration(), t - clipStart)));
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
