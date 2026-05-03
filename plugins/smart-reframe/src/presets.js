// presets — target aspect ratios + default solver constraints.

export const RATIOS = [
  { id: "9:16",  label: "Vertical (9:16)",   w: 9,  h: 16 },
  { id: "1:1",   label: "Square (1:1)",      w: 1,  h: 1  },
  { id: "4:5",   label: "Portrait (4:5)",    w: 4,  h: 5  },
  { id: "2.39:1", label: "Anamorphic (2.39:1)", w: 2.39, h: 1 },
  { id: "16:9",  label: "Landscape (16:9)",  w: 16, h: 9  },
];

export function findRatio(id) {
  return RATIOS.find((r) => r.id === id) ?? RATIOS[0];
}

export const SUBJECT_MODES = [
  { id: "person",         label: "Person",         classes: ["person"] },
  { id: "face",           label: "Face only",      classes: ["__face__"] }, // routes to MediaPipe
  { id: "largest-object", label: "Largest object", classes: null /* any */ },
];

export const DEFAULTS = {
  ratioId: "9:16",
  subjectMode: "person",
  sampleStrideHz: 4,        // 4 fps sampling — good cost/quality balance
  smoothSigmaSamples: 4,    // Gaussian smoothing window in sample units
  maxPanPxPerSec: 250,
  maxZoomPctPerSec: 30,
  minConf: 0.4,
};
