// pack: srt — bottom-third white-on-black bar, classic burn-in, no animation.

export default {
  id: "srt",
  label: "Classic SRT",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 600 3.2vh/1.2 ui-sans-serif, system-ui, sans-serif; color: #fff; text-align: center; padding: 6px 14px; background: rgba(0,0,0,0.65); border-radius: 4px; max-width: 80vw; margin: 0 auto; }
    [data-cw-cap-clip] .word { display: inline-block; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: #ffeb3b; }
  `,
  popThreshold: 0.85, // rare highlight
  enter: { scale: 1, y: 0, ease: "none", dur: 0.001 },
  enterCalm: { scale: 1, y: 0, ease: "none", dur: 0.001 },
  exitDur: 0.001,
};
