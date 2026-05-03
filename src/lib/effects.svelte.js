// Effects store — agent-generated parametric controls bound to the
// composition's own elements. Each effect is plain data (a control
// schema + a list of bindings + a current value), not code. The
// composition's render path applies the bindings into the iframe at
// build-srcdoc time, so changing a value hot-swaps the result.
//
// Each entry round-trips through the workbook via wb.collection,
// same Loro-list idiom assets.svelte.js uses. Cmd+S persists the
// whole list inside the .workbook.html; reopening the file rehydrates
// the panel and re-applies the bindings without any extra plumbing.
//
// Shape:
//   {
//     id: "ef_abc123",
//     name: "Hero accent",
//     description?: string,
//     control: {
//       kind: "color" | "number" | "text" | "select" | "boolean",
//       label?: string,
//       default: any,
//       min?, max?, step?,        // number
//       options?: [{value,label}], // select
//       placeholder?: string,      // text
//     },
//     bindings: [{
//       kind: "css-property" | "css-variable" | "attribute" | "text-content",
//       selector: string,         // css selector OR (for css-variable) ":root"
//       property?: string,        // css-property: "background-color"; attr: "title"
//     }],
//     value: any,                 // current live value
//     createdBy?: "agent" | "user",
//     createdAt?: number,
//   }

import { wb } from "@work.books/runtime";
import { recordEdit, recordDelete } from "./historyBackend.svelte.js";

const effectsCollection = wb.collection("effects");

class EffectsStore {
  items = $state([]);
  hydrated = $state(false);

  constructor() {
    // Subscribe → reactive array. wb.collection dedupes by .id so the
    // upsert/remove semantics stay clean even on rehydrate.
    effectsCollection.subscribe((list) => {
      this.items = list.slice();
      this.hydrated = true;
    });
    effectsCollection.ready?.().then(() => { this.hydrated = true; })
      .catch(() => { this.hydrated = true; });
  }

  get(id) {
    return this.items.find((e) => e.id === id) ?? null;
  }

  /** Insert or replace by id. Returns the stored entry. */
  upsert(entry) {
    if (!entry?.id) throw new Error("effect.upsert: id required");
    const next = {
      createdAt: Date.now(),
      createdBy: "user",
      ...entry,
    };
    effectsCollection.upsert(next);
    recordEdit(`effect:${next.id}`, `upsert effect ${next.id}`);
    return next;
  }

  /** Patch a subset of fields on an existing entry. Returns the merged
   *  result, or null if no entry exists for that id. */
  update(id, patch) {
    const cur = this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch, id: cur.id };
    effectsCollection.upsert(next);
    recordEdit(`effect:${id}`, `update effect ${id}`);
    return next;
  }

  /** Just bump the live value. Most common write path; the panel and
   *  the agent's effect_update both use this. */
  setValue(id, value) {
    return this.update(id, { value });
  }

  remove(id) {
    if (!this.get(id)) return false;
    effectsCollection.remove(id);
    recordDelete(`effect:${id}`, `remove effect ${id}`);
    return true;
  }

  /** Generate a fresh id with a short readable prefix. Agent-emitted
   *  effects can pass their own id; if absent, mintId fills in. */
  mintId() {
    return "ef_" + Math.random().toString(36).slice(2, 10);
  }
}

export const effects = new EffectsStore();
