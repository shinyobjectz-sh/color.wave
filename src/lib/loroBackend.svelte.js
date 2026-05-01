// Loro doc bootstrap — sequencing glue between Vite's bundle order
// and the workbook runtime's <wb-doc> registration.
//
// What this file owns AFTER the wb.* SDK migration (Phase 1):
//   • Static loro-crdt import — keeps the WASM module init order
//     stable through vite-plugin-singlefile's flatten step.
//   • Surfaces the loro namespace as window.__wb_loro so the
//     runtime's <wb-doc> resolver can pick it up (matches the
//     pre-SDK working pattern; see the long comment below).
//   • bootstrapLoro() / getDoc() — async + sync handle accessors
//     used by autoSave + idbPersistence (which subscribe to local
//     commits to drive the IDB snapshot loop). The wb.* SDK uses
//     its own resolver; data stores should NOT call these.
//   • snapshotCompositionBytes() — used by exportProject zip
//     packaging when it needs a canonical doc-bytes snapshot.
//
// What MOVED to the SDK (vendor/workbooks/.../storage/):
//   • readComposition / writeComposition / diffShrink → wb.text
//   • readAssets / pushAsset / removeAssetById / replaceAssets →
//     wb.collection("assets")
//   • readUserSkills / pushUserSkill / removeUserSkillByName →
//     wb.collection("user-skills")
//   • plugins list (was inline in plugins.svelte.js) →
//     wb.collection("plugins")
//
// Static loro-crdt imports: this is what gets the module into the
// user's Vite-bundled main.js with the right module-init order.
// Dynamic `await import("loro-crdt")` from main.js produced TDZ
// violations through vite-plugin-singlefile's flatten step (the
// preload shim's `() => moduleNs` callback was invoked before the
// module body had run). A static named import + namespace export
// matches the original working pre-SDK pattern.
//
// LoroDoc itself isn't used here directly anymore (the runtime
// registers the handle for our <wb-doc id="hyperframes-state">
// element); the import is a sequencing guarantee. The `* as` is so
// we can hand the full namespace to the runtime via window.__wb_loro
// before mountHtmlWorkbook runs.
import { LoroDoc as _LoroDoc } from "loro-crdt";
import * as _loroNs from "loro-crdt";
if (typeof window !== "undefined" && _LoroDoc) {
  window.__wb_loro = _loroNs;
}

const DOC_ID = "hyperframes-state";

let _doc = null;            // raw LoroDoc (handle.inner())
let _bootPromise = null;

/**
 * Resolve the raw LoroDoc registered by the workbook runtime for our
 * <wb-doc id="hyperframes-state"> element.
 *
 * Used by autoSave / idbPersistence — they need the raw doc to
 * subscribe to local commits and snapshot bytes back to IDB. Stores
 * holding USER DATA (composition, assets, plugins, user-skills)
 * route through the wb.* SDK instead, which has its own resolver.
 *
 * Idempotent — once resolved, subsequent calls reuse the cached doc.
 * If a previous attempt threw, we retry on the next call.
 */
const RUNTIME_POLL_TIMEOUT_MS = 10_000;
const RUNTIME_POLL_INTERVAL_MS = 25;

export function bootstrapLoro() {
  if (_doc) return Promise.resolve(_doc);
  if (_bootPromise) return _bootPromise;

  const promise = (async () => {
    const start = Date.now();
    while (Date.now() - start < RUNTIME_POLL_TIMEOUT_MS) {
      const rt = typeof window !== "undefined" ? window.__wbRuntime : null;
      if (rt && typeof rt.getDocHandle === "function") {
        const handle = rt.getDocHandle(DOC_ID);
        if (handle && typeof handle.inner === "function") {
          _doc = handle.inner();

          // Hydrate from IndexedDB before resolving so every downstream
          // store (composition / assets / plugins) sees the restored
          // state on first read. Lazy-import to dodge a module-init
          // cycle (idbPersistence is a leaf consumer).
          try {
            const { hydrateFromIdb } = await import("./idbPersistence.svelte.js");
            await hydrateFromIdb(_doc);
          } catch (e) {
            console.warn("[loroBackend] IDB hydrate skipped:", e);
          }

          return _doc;
        }
      }
      await new Promise((r) => setTimeout(r, RUNTIME_POLL_INTERVAL_MS));
    }
    // Timeout — clear the cached promise so the NEXT caller can retry
    // (e.g. if the user reloads or the runtime mounts late).
    _bootPromise = null;
    throw new Error(
      `loroBackend: timed out (${RUNTIME_POLL_TIMEOUT_MS}ms) waiting for ` +
      `<wb-doc id="${DOC_ID}"> to register. Make sure index.html has ` +
      `<wb-workbook><wb-doc id="${DOC_ID}" format="loro" /></wb-workbook> ` +
      `and main.js calls bundle.mountHtmlWorkbook(...).`,
    );
  })();

  // Clear cache on rejection so retries work; keep on success so we
  // return the cached doc immediately on every subsequent call.
  promise.catch(() => { _bootPromise = null; });
  _bootPromise = promise;
  return promise;
}

/** Synchronous access — returns null until bootstrapLoro() resolves. */
export function getDoc() { return _doc; }

/** Force-export the current snapshot synchronously. Used by the
 *  Package flow when it needs canonical bytes for an external file
 *  format (zip export). Returns null if the doc isn't bootstrapped. */
export function snapshotCompositionBytes() {
  return _doc ? _doc.export({ mode: "snapshot" }) : null;
}

/** The doc id the workbook registers for its single <wb-doc>. The
 *  wb.* SDK's resolver discovers this via __wbRuntime.listDocIds, but
 *  the legacy bootstrap path above hardcodes it; both must match. */
export const HYPERFRAMES_DOC_ID = DOC_ID;
