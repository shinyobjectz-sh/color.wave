// Adjustment layers — time-anchored shader / filter passes that ride
// the timeline like clips do. The composition's frame at time `t`
// rendered THROUGH every adjustment layer whose `[start, start+duration]`
// window contains `t`. Order matters: layers compose top-to-bottom by
// `trackIndex` (lower index = earlier in the chain).
//
// Each entry round-trips through the workbook via wb.collection,
// same Loro-list idiom assets / effects use. Cmd+S persists the whole
// list inside the .html; reopening rehydrates the timeline + the
// active filter chain without any extra plumbing.
//
// Shape:
//   {
//     id: "adj_abc123",
//     shader: "crt" | "scanlines" | "glitch" | "vhs" | "grain" | "colorgrade" | <agent-defined>,
//     start: 5.0,                  // seconds (timeline position)
//     duration: 3.0,               // seconds
//     trackIndex: 5,               // lane id; adjustment lanes are
//                                  //   numbered ≥ 100 to keep them
//                                  //   visually separate from clip
//                                  //   lanes (Timeline filters by range)
//     params: { … },               // shader-specific uniforms; see
//                                  //   adjustmentsRender.js catalog
//                                  //   for each shader's expected keys
//     opacity?: number,            // 0..1, default 1
//     blendMode?: "normal" | "screen" | "multiply" | "overlay",
//     label?: string,              // optional display name for the
//                                  //   timeline bar / params panel
//     createdBy?: "agent" | "user",
//     createdAt?: number,
//   }

import { wb } from "@work.books/runtime";
import { recordEdit, recordDelete } from "./historyBackend.svelte.js";

const adjustmentsCollection = wb.collection("adjustments");

/** Lowest trackIndex that's reserved for adjustment layers. Clip lanes
 *  occupy 0..99; adjustment lanes start here so the Timeline's lane-
 *  assignment logic can keep them separate without a `kind` discriminator
 *  on every render path. */
export const ADJUSTMENT_TRACK_BASE = 100;

class AdjustmentsStore {
  items = $state([]);
  hydrated = $state(false);

  constructor() {
    adjustmentsCollection.subscribe((list) => {
      this.items = list.slice();
      this.hydrated = true;
    });
    adjustmentsCollection.ready?.().then(() => { this.hydrated = true; })
      .catch(() => { this.hydrated = true; });
  }

  get(id) {
    return this.items.find((a) => a.id === id) ?? null;
  }

  /** Insert or replace by id. Returns the stored entry. */
  upsert(entry) {
    if (!entry?.id) throw new Error("adjustment.upsert: id required");
    if (!entry?.shader) throw new Error("adjustment.upsert: shader required");
    if (!Number.isFinite(entry.start) || entry.start < 0) {
      throw new Error("adjustment.upsert: start must be a non-negative number");
    }
    if (!Number.isFinite(entry.duration) || entry.duration <= 0) {
      throw new Error("adjustment.upsert: duration must be a positive number");
    }
    const next = {
      createdAt: Date.now(),
      createdBy: "user",
      trackIndex: ADJUSTMENT_TRACK_BASE,
      params: {},
      opacity: 1,
      ...entry,
    };
    // Clamp trackIndex into the adjustment range — agents that pass a
    // value < 100 (mistaking it for a clip lane) get silently corrected
    // rather than colliding with clips on the timeline.
    if (!Number.isFinite(next.trackIndex) || next.trackIndex < ADJUSTMENT_TRACK_BASE) {
      next.trackIndex = ADJUSTMENT_TRACK_BASE;
    }
    adjustmentsCollection.upsert(next);
    recordEdit(`adjustment:${next.id}`, `upsert adjustment ${next.id}`);
    return next;
  }

  /** Patch a subset of fields on an existing entry. Returns the merged
   *  result, or null if no entry exists for that id. Most common write
   *  path: drag/trim updates `start`/`duration`; param-panel updates
   *  bump `params`. */
  update(id, patch) {
    const cur = this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, id: cur.id };
    if (patch?.params) {
      // Merge params rather than replace so a param-panel slider that
      // only emits one key doesn't blow away the rest.
      next.params = { ...cur.params, ...patch.params };
    }
    adjustmentsCollection.upsert(next);
    recordEdit(`adjustment:${id}`, `update adjustment ${id}`);
    return next;
  }

  /** Convenience for the params panel — set ONE uniform without a
   *  full update() roundtrip. */
  setParam(id, key, value) {
    return this.update(id, { params: { [key]: value } });
  }

  remove(id) {
    if (!this.get(id)) return false;
    adjustmentsCollection.remove(id);
    recordDelete(`adjustment:${id}`, `remove adjustment ${id}`);
    return true;
  }

  /** Generate a fresh id. Agents that know what they're doing can
   *  pass their own; for the panel UI's "+ Add" button we mint one. */
  mintId() {
    return "adj_" + Math.random().toString(36).slice(2, 10);
  }
}

export const adjustments = new AdjustmentsStore();
