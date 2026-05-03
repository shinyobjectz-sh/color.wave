// bezier — interactive 4-control-point cubic curve editor.
//
// P0 = (0,0) and P3 = (1,1) are fixed. User drags P1 and P2 inside a
// canvas. We draw: the cubic curve, the two control handles as
// dotted lines, and big circular hit-targets on P1/P2.
//
// Coordinates: canvas y is inverted (top=0). Curve coords are in
// [0,1] with y up.

const HANDLE_R = 7;

export function mountBezier(canvas, initial, onChange) {
  const ctx = canvas.getContext("2d");
  let p1 = { ...initial.p1 };
  let p2 = { ...initial.p2 };
  let drag = null; // "p1" | "p2" | null

  const dpr = window.devicePixelRatio || 1;
  function size() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }
  size();
  window.addEventListener("resize", size);

  function w() { return canvas.width; }
  function h() { return canvas.height; }
  function toPx(p) { return [p.x * w(), (1 - p.y) * h()]; }
  function toNorm(px, py) {
    return {
      x: clamp01(px / w()),
      y: clamp01(1 - py / h()),
    };
  }

  function draw() {
    ctx.clearRect(0, 0, w(), h());
    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1 * dpr;
    for (let i = 1; i < 4; i++) {
      const x = (i / 4) * w();
      const y = (i / 4) * h();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h()); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w(), y); ctx.stroke();
    }
    // handles
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.moveTo(0, h()); ctx.lineTo(p1x, p1y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w(), 0); ctx.lineTo(p2x, p2y); ctx.stroke();
    ctx.setLineDash([]);
    // curve
    ctx.strokeStyle = "rgb(0, 220, 255)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, h());
    ctx.bezierCurveTo(p1x, p1y, p2x, p2y, w(), 0);
    ctx.stroke();
    // points
    drawPoint(p1x, p1y, drag === "p1");
    drawPoint(p2x, p2y, drag === "p2");
  }

  function drawPoint(x, y, active) {
    ctx.fillStyle = active ? "rgb(0, 220, 255)" : "rgb(255,255,255)";
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  function pickHandle(px, py) {
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    const r = HANDLE_R * dpr * 1.8;
    if (dist(px, py, p1x, p1y) < r) return "p1";
    if (dist(px, py, p2x, p2y) < r) return "p2";
    return null;
  }
  function localPx(ev) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr];
  }
  function onDown(ev) {
    const [px, py] = localPx(ev);
    drag = pickHandle(px, py);
    if (drag) ev.preventDefault();
    draw();
  }
  function onMove(ev) {
    if (!drag) return;
    const [px, py] = localPx(ev);
    const n = toNorm(px, py);
    if (drag === "p1") p1 = n;
    else p2 = n;
    onChange?.({ p1, p2 });
    draw();
  }
  function onUp() {
    if (!drag) return;
    drag = null;
    draw();
  }

  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  draw();

  return {
    set(curve) {
      p1 = { ...curve.p1 };
      p2 = { ...curve.p2 };
      draw();
    },
    get() {
      return { p1: { ...p1 }, p2: { ...p2 } };
    },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", size);
    },
  };
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
