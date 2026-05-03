// curves — single bezier curve canvas (master tone curve).
//
// 4 control points (P0=0,0; P3=1,1 fixed; user drags P1 and P2). Output
// is a 256-entry LUT used to bias `brightness/contrast` slightly. v0.1
// only applies a master curve; per-channel + zoned curves arrive in v0.2
// alongside the WebGL Hald LUT path.

const HANDLE_R = 7;

export function mountCurves(canvas, initial, onChange) {
  const ctx = canvas.getContext("2d");
  let p1 = { ...initial.p1 };
  let p2 = { ...initial.p2 };
  let drag = null;
  const dpr = window.devicePixelRatio || 1;

  function size() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }
  size();
  const ro = new ResizeObserver(size);
  ro.observe(canvas);

  function w() { return canvas.width; }
  function h() { return canvas.height; }
  function toPx(p) { return [p.x * w(), (1 - p.y) * h()]; }
  function toNorm(px, py) {
    return { x: clamp01(px / w()), y: clamp01(1 - py / h()) };
  }

  function draw() {
    ctx.clearRect(0, 0, w(), h());
    // diagonal reference (no-op curve)
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(0, h()); ctx.lineTo(w(), 0); ctx.stroke();
    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for (let i = 1; i < 4; i++) {
      const x = (i / 4) * w(), y = (i / 4) * h();
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h()); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w(), y); ctx.stroke();
    }
    // curve
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    ctx.strokeStyle = "rgb(0, 220, 255)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, h());
    ctx.bezierCurveTo(p1x, p1y, p2x, p2y, w(), 0);
    ctx.stroke();
    // handles
    drawPt(p1x, p1y, drag === "p1");
    drawPt(p2x, p2y, drag === "p2");
  }

  function drawPt(x, y, active) {
    ctx.fillStyle = active ? "rgb(0, 220, 255)" : "#fff";
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  function pickHandle(px, py) {
    const [p1x, p1y] = toPx(p1);
    const [p2x, p2y] = toPx(p2);
    const r = HANDLE_R * dpr * 1.8;
    if (Math.hypot(px - p1x, py - p1y) < r) return "p1";
    if (Math.hypot(px - p2x, py - p2y) < r) return "p2";
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
    if (drag === "p1") p1 = n; else p2 = n;
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

  return {
    set(curve) { p1 = { ...curve.p1 }; p2 = { ...curve.p2 }; draw(); },
    get() { return { p1: { ...p1 }, p2: { ...p2 } }; },
    destroy() {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      ro.disconnect();
    },
  };
}

/**
 * Convert a 4-point curve into approximate (brightness, contrast)
 * adjustments: midpoint y vs 0.5 → brightness shift; |slope at 0.5|
 * vs 1 → contrast shift. Fast affine fit of the curve, good enough
 * for the CSS path.
 */
export function curveToAdj(curve) {
  const yMid = bezierY(curve, 0.5);
  const yLo = bezierY(curve, 0.25);
  const yHi = bezierY(curve, 0.75);
  const brightness = 1 + (yMid - 0.5) * 0.4;
  const contrast = 1 + (yHi - yLo - 0.5) * 0.6;
  return { brightness, contrast };
}

function bezierY(curve, t) {
  const u = 1 - t;
  return 3 * u * u * t * curve.p1.y + 3 * u * t * t * curve.p2.y + t * t * t;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
