// pack: tiktok — bouncy white+stroke captions with accent-pop on stress.

export default {
  id: "tiktok",
  label: "TikTok bouncy",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 800 7vh/1.0 "Inter", system-ui, sans-serif; color: #fff; text-align: center; text-shadow: 0 4px 0 #000, 0 0 18px var(--cw-accent, #00dcff); letter-spacing: -0.02em; padding: 0 8vw; }
    [data-cw-cap-clip] .word { display: inline-block; transform-origin: 50% 80%; will-change: transform, color, opacity; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: var(--cw-accent, #00dcff); }
  `,
  popThreshold: 0.6,
  enter: { scale: 0.6, y: 12, ease: "back.out(2.4)", dur: 0.18 },
  enterCalm: { scale: 0.85, y: 8, ease: "back.out(1.5)", dur: 0.18 },
  exitDur: 0.12,
};
