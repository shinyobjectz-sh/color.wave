// waveform — minimum-viable canvas waveform with silence-band overlay.
//
// Inputs:
//   audioBuffer: Float32Array (mono, decoded at any rate) + sampleRate
//   silences:    [{ t_start, t_end }] in seconds, drawn as red bands
//   cuts:        [{ drop: [t0,t1] }] in seconds, drawn as solid red bars
//
// Decimates to one min/max pair per pixel column. Crisp, cheap, no deps.

export function mountWaveform(canvas) {
  const ctx = canvas.getContext("2d");
  let buffer = null;
  let sampleRate = 16000;
  let silences = [];
  let cuts = [];

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

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!buffer) return;
    const totalS = buffer.length / sampleRate;

    // Bands (silences) — soft red
    ctx.fillStyle = "rgba(255, 64, 64, 0.18)";
    for (const s of silences) {
      const x0 = (s.t_start / totalS) * w;
      const x1 = (s.t_end / totalS) * w;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }

    // Waveform — decimated min/max per column
    ctx.fillStyle = "rgb(180, 200, 220)";
    const samplesPerPx = Math.max(1, Math.floor(buffer.length / w));
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPx;
      const end = Math.min(buffer.length, start + samplesPerPx);
      let lo = 0, hi = 0;
      for (let i = start; i < end; i++) {
        const v = buffer[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const y0 = mid - hi * mid;
      const y1 = mid - lo * mid;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }

    // Cuts — solid red bar at the dropped windows
    ctx.fillStyle = "rgba(255, 32, 32, 0.55)";
    for (const c of cuts) {
      const x0 = (c.drop[0] / totalS) * w;
      const x1 = (c.drop[1] / totalS) * w;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
    }
  }

  return {
    setBuffer(buf, rate) {
      buffer = buf;
      sampleRate = rate;
      draw();
    },
    setSilences(s) { silences = s; draw(); },
    setCuts(c) { cuts = c; draw(); },
    destroy() { ro.disconnect(); },
  };
}
