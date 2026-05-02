// Persisted layout sizes — chat column width, timeline row height,
// zoom, aspect, active left-panel tab.
//
// State is backed by `wb.app` from @work.books/runtime/svelte, so
// every mutation flows through the workbook's Y.Doc and round-trips
// in the .workbook.html file. Components keep their existing API
// surface (`layout.chatWidth`, `layout.setChatWidth(...)`, etc.) —
// only the storage layer changed (was: `$state(...)` + localStorage,
// now: `wb.app` + Y.Doc).
//
// Reactivity: reads through the `#state` Proxy register Svelte deps
// via the wb.app Reactor, so templates re-render on remote (and
// local) changes the same way they did with `$state`.
//
// Why this is safe to call at module load: main.js dynamically
// imports App.svelte AFTER mountHtmlWorkbook + substrate.bootstrap,
// so by the time this module evaluates the Y.Doc is bound and
// substrate has hydrated. wb.app() resolves synchronously.

import { app } from "@work.books/runtime/svelte";

export const LEFT_TABS = ["chat", "assets", "plugins"];

// Standard social/cinematic aspect ratios. Order = display order
// in the picker. Stored as the "w:h" string so it round-trips
// localStorage cleanly and keys the iframe's CSS aspect-ratio.
// `render` is the canonical pixel size to use when rendering to
// video — driven by typical platform expectations.
export const ASPECT_PRESETS = [
  { id: "16:9", label: "16:9", w: 16, h: 9,  hint: "Landscape · YouTube, web",       render: { w: 1920, h: 1080 } },
  { id: "9:16", label: "9:16", w: 9,  h: 16, hint: "Portrait · TikTok, Reels, Shorts", render: { w: 1080, h: 1920 } },
  { id: "1:1",  label: "1:1",  w: 1,  h: 1,  hint: "Square · feed, IG post",          render: { w: 1080, h: 1080 } },
  { id: "4:5",  label: "4:5",  w: 4,  h: 5,  hint: "Portrait · IG feed",              render: { w: 1080, h: 1350 } },
];

const CHAT_MIN = 320;
const CHAT_MAX = 760;
const TL_MIN   = 96;
const TL_MAX   = 480;

// HyperFrames Studio's zoom scale. Multipliers on pps_base = 100,
// so 1 second = 25 / 50 / 100 / 150 / 200 px.
const PPS_BASE = 100;
export const ZOOM_PRESETS = [0.25, 0.5, 1, 1.5, 2];

class LayoutStore {
  // Persisted state — round-trips through Y.Doc → substrate WAL →
  // .workbook.html file. Defaults are seeded only if the underlying
  // Y.Map is empty after hydration; existing user state always wins.
  //
  // wb.app() is lazy: the Proxy returned here defers SyncedStore
  // creation until the first read/write, so it's safe to call this
  // at module load even though singlefile bundling runs us before
  // main.js's runtime mount.
  #state = app({
    chatWidth:      500,
    timelineHeight: 240,
    pps:            PPS_BASE,
    aspect:         "16:9",
    leftTab:        "chat",
  });

  get chatWidth()      { return this.#state.chatWidth; }
  get timelineHeight() { return this.#state.timelineHeight; }
  get pps()            { return this.#state.pps; }
  get aspect()         { return this.#state.aspect; }
  get leftTab()        { return this.#state.leftTab; }

  setChatWidth(px) {
    const max = Math.min(CHAT_MAX, Math.floor((window.innerWidth || 1200) - 480));
    this.#state.chatWidth = Math.max(CHAT_MIN, Math.min(max, Math.round(px)));
  }

  setTimelineHeight(px) {
    const max = Math.min(TL_MAX, Math.floor((window.innerHeight || 800) - 220));
    this.#state.timelineHeight = Math.max(TL_MIN, Math.min(max, Math.round(px)));
  }

  setZoom(multiplier) {
    const m = Math.max(ZOOM_PRESETS[0], Math.min(ZOOM_PRESETS[ZOOM_PRESETS.length - 1], +multiplier));
    this.#state.pps = PPS_BASE * m;
  }

  setAspect(id) {
    if (!ASPECT_PRESETS.some((a) => a.id === id)) return;
    this.#state.aspect = id;
  }

  setLeftTab(tab) {
    if (!LEFT_TABS.includes(tab)) return;
    this.#state.leftTab = tab;
  }

  get aspectRatio() {
    const a = ASPECT_PRESETS.find((p) => p.id === this.#state.aspect) ?? ASPECT_PRESETS[0];
    return `${a.w} / ${a.h}`;
  }

  /** Step zoom up or down by one preset. */
  zoomBy(direction) {
    const cur = this.#state.pps / PPS_BASE;
    const sortedPresets = [...ZOOM_PRESETS].sort((a, b) => a - b);
    let idx = sortedPresets.findIndex((p) => Math.abs(p - cur) < 1e-3);
    if (idx === -1) {
      // Snap to nearest if current isn't on a preset.
      idx = sortedPresets.reduce((best, p, i) =>
        Math.abs(p - cur) < Math.abs(sortedPresets[best] - cur) ? i : best, 0);
    }
    const next = Math.max(0, Math.min(sortedPresets.length - 1, idx + direction));
    this.setZoom(sortedPresets[next]);
  }
}

export const layout = new LayoutStore();
