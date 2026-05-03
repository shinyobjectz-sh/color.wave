// pack: apple-keynote — thin, restrained, single accent color, no stroke.

export default {
  id: "apple-keynote",
  label: "Apple keynote",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 200 5vh/1.2 "SF Pro Display", "Inter", system-ui, sans-serif; color: #f5f5f7; text-align: center; letter-spacing: -0.01em; padding: 0 12vw; }
    [data-cw-cap-clip] .word { display: inline-block; will-change: transform, opacity, color; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: var(--cw-accent, #2997ff); font-weight: 400; }
  `,
  popThreshold: 0.7,
  enter: { scale: 1, y: 18, ease: "power2.out", dur: 0.32 },
  enterCalm: { scale: 1, y: 14, ease: "power2.out", dur: 0.32 },
  exitDur: 0.18,
};
