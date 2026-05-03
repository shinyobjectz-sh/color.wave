// pack: mrbeast — chunky black-stroked yellow with overshoot pop.

export default {
  id: "mrbeast",
  label: "MrBeast chunky",
  icon: "Aa",
  css: `
    [data-cw-cap-clip] { font: 900 9vh/0.95 "Impact", "Anton", system-ui, sans-serif; color: #ffe600; text-align: center; -webkit-text-stroke: 0.4vh #000; text-shadow: 0 6px 0 #000, 0 8px 0 rgba(0,0,0,0.5); letter-spacing: 0; padding: 0 6vw; text-transform: uppercase; }
    [data-cw-cap-clip] .word { display: inline-block; transform-origin: 50% 90%; will-change: transform, color; opacity: 0; }
    [data-cw-cap-clip] .word.pop { color: #fff; -webkit-text-stroke-width: 0.6vh; }
  `,
  popThreshold: 0.55,
  enter: { scale: 0.5, y: 0, ease: "back.out(3)", dur: 0.16 },
  enterCalm: { scale: 0.8, y: 0, ease: "back.out(1.6)", dur: 0.16 },
  exitDur: 0.10,
};
