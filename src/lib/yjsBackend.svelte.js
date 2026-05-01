// Y.Doc bootstrap — sequencing glue between Vite's bundle order and
// the workbook runtime's <wb-doc> registration.
//
// What this file owns AFTER the Phase 2 (Yjs) backend swap:
//   • Static yjs import — keeps the module init order stable through
//     vite-plugin-singlefile's flatten step.
//   • bootstrapYjs() / getDoc() — async + sync handle accessors used by
//     autoSave, projectIO, and the userSkills legacy migration. The
//     wb.* SDK uses its own resolver via __wbRuntime; data stores
//     should not call these directly.
//   • snapshotCompositionBytes() — used by exportProject zip packaging
//     when it needs canonical doc-bytes for an external archive.
//
// What MOVED to the SDK (vendor/workbooks/.../storage/):
//   • readComposition / writeComposition / diffShrink → wb.text
//   • readAssets / pushAsset / removeAssetById / replaceAssets →
//     wb.collection("assets")
//   • readUserSkills / pushUserSkill / removeUserSkillByName →
//     wb.collection("user-skills")
//   • plugins list (was inline in plugins.svelte.js) →
//     wb.collection("plugins")

// Static yjs import: the singlefile flatten output prefers a static
// reference here so the module body has run before the runtime tries
// to register a Y.Doc backed handle. (Loro had a similar requirement
// pre-Phase-2.)
import * as Y from "yjs";

const DOC_ID = "hyperframes-state";

let _doc = null;            // raw Y.Doc (handle.doc | handle.inner())
let _bootPromise = null;

const RUNTIME_POLL_TIMEOUT_MS = 10_000;
const RUNTIME_POLL_INTERVAL_MS = 25;

/**
 * Resolve the raw Y.Doc registered by the workbook runtime for our
 * <wb-doc id="hyperframes-state"> element. Idempotent.
 *
 * Side effects on first resolve:
 *   1. Attempts a one-time legacy port (pre-Phase-2 Loro snapshot in
 *      IDB → fresh Y.Doc + y-indexeddb persistence). Lazy-imports the
 *      port module so brand-new users never load `loro-crdt`.
 *   2. Wires a `y-indexeddb` provider so subsequent edits persist
 *      automatically. autoSave subscribes to this provider's events
 *      to drive the menubar status pill.
 */
export function bootstrapYjs() {
  if (_doc) return Promise.resolve(_doc);
  if (_bootPromise) return _bootPromise;

  const promise = (async () => {
    const start = Date.now();
    while (Date.now() - start < RUNTIME_POLL_TIMEOUT_MS) {
      const rt = typeof window !== "undefined" ? window.__wbRuntime : null;
      if (rt && typeof rt.getDocHandle === "function") {
        const handle = rt.getDocHandle(DOC_ID);
        const inner =
          handle?.doc instanceof Y.Doc
            ? handle.doc
            : (typeof handle?.inner === "function" ? handle.inner() : null);
        if (inner instanceof Y.Doc) {
          _doc = inner;

          // 1. Best-effort one-time legacy port. Skips fast if no
          //    legacy IDB store exists.
          try {
            const { runLegacyLoroPortIfPresent } = await import("./legacyLoroPort.js");
            await runLegacyLoroPortIfPresent(_doc);
          } catch (e) {
            console.warn("[yjsBackend] legacy port skipped:", e?.message ?? e);
          }

          // 2. Attach y-indexeddb. Persisted state hydrates into _doc;
          //    every subsequent updateV2 streams to IDB automatically.
          try {
            const { setupIdbPersistence } = await import("./idbPersistence.svelte.js");
            await setupIdbPersistence(_doc);
          } catch (e) {
            console.warn("[yjsBackend] idb provider failed:", e?.message ?? e);
          }

          return _doc;
        }
      }
      await new Promise((r) => setTimeout(r, RUNTIME_POLL_INTERVAL_MS));
    }
    _bootPromise = null;
    throw new Error(
      `yjsBackend: timed out (${RUNTIME_POLL_TIMEOUT_MS}ms) waiting for ` +
      `<wb-doc id="${DOC_ID}"> to register. Make sure index.html has ` +
      `<wb-workbook><wb-doc id="${DOC_ID}" format="yjs" /></wb-workbook> ` +
      `and main.js calls bundle.mountHtmlWorkbook(...).`,
    );
  })();

  promise.catch(() => { _bootPromise = null; });
  _bootPromise = promise;
  return promise;
}

/** Synchronous access — returns null until bootstrapYjs() resolves. */
export function getDoc() { return _doc; }

/** Force-export the current update bytes synchronously. Used by the
 *  Package flow when it needs canonical bytes for an external file
 *  format (zip export). Returns null if the doc isn't bootstrapped. */
export function snapshotCompositionBytes() {
  return _doc ? Y.encodeStateAsUpdate(_doc) : null;
}

/** The doc id the workbook registers for its single <wb-doc>. */
export const HYPERFRAMES_DOC_ID = DOC_ID;
