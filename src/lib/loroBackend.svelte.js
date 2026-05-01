// Backwards-compatibility shim.
//
// Phase 2 of core-0or migrated the persistent CRDT backend from Loro
// to Yjs. The real implementation lives in `yjsBackend.svelte.js`;
// this file re-exports the same names so existing import sites
// (autoSave, projectIO, userSkills) keep working without an immediate
// rename. Future cleanup pass deletes this shim — but the rename
// touches every consumer and isn't worth a single-purpose commit.
//
// IMPORTANT: this module no longer imports `loro-crdt`. Pre-Phase-2
// the static import here was a sequencing guarantee for the
// vite-plugin-singlefile flatten step; that requirement transferred
// to the static `import * as Y from "yjs"` in yjsBackend.

export {
  bootstrapYjs as bootstrapLoro,
  getDoc,
  snapshotCompositionBytes,
  HYPERFRAMES_DOC_ID,
} from "./yjsBackend.svelte.js";
