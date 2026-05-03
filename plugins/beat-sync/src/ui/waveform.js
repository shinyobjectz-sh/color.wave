// waveform — canvas waveform with beat tick overlay.

export function mountBeatWaveform(canvas) {
  const ctx = canvas.getContext("2d");
  let pcm = null, sr = 16000, beats = [];
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
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!pcm) return;
    const totalS = pcm.length / sr;
    // Waveform
    ctx.fillStyle = "rgb(180, 200, 220)";
    const samplesPerPx = Math.max(1, Math.floor(pcm.length / w));
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPx;
      const end = Math.min(pcm.length, start + samplesPerPx);
      let lo = 0, hi = 0;
      for (let i = start; i < end; i++) {
        const v = pcm[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const y0 = mid - hi * mid;
      const y1 = mid - lo * mid;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
    // Beat ticks
    for (const b of beats) {
      const x = (b.t / totalS) * w;
      ctx.fillStyle = b.downbeat ? "rgb(0, 220, 255)" : "rgba(0, 220, 255, 0.45)";
      const tickH = b.downbeat ? h : h * 0.5;
      ctx.fillRect(x - 0.5 * dpr, (h - tickH) / 2, 1 * dpr, tickH);
    }
  }

  return {
    setBuffer(buf, rate) { pcm = buf; sr = rate; draw(); },
    setBeats(b) { beats = b; draw(); },
    destroy() { ro.disconnect(); },
  };
}
