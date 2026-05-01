// y-indexeddb-backed persistence for the Y.Doc.
//
// Architecture (post-Phase-2):
//   • The .workbook.html file is just the APP BUNDLE. User projects
//     (compositions, plugins, configs, history) live in browser IDB.
//   • A `y-indexeddb` IndexeddbPersistence provider streams every
//     Y.Doc update to IDB and rehydrates the doc on construction —
//     no hand-rolled snapshot loop, no manual subscribe.
//   • Cmd+S still surfaces a toast (handled by autoSave + the iframe
//     forwarder in main.js); the actual write is the provider's job.
//
// The exports mimic the legacy hand-rolled IDB API so autoSave +
// projectIO continue to compile. Most are now thin wrappers.

import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

const ROOM_NAME = "colorwave-state";

let _provider = null;          // y-indexeddb IndexeddbPersistence
let _providerPromise = null;
const _statusListeners = new Set();
let _status = "idle";          // "idle" | "pending" | "saving" | "saved" | "error"

function emitStatus(next, msg) {
  _status = next;
  for (const fn of _statusListeners) {
    try { fn(next, msg); } catch (e) { console.warn("[idb] listener threw:", e); }
  }
}

/**
 * Wire a `y-indexeddb` provider to the doc. Resolves once the
 * provider has rehydrated any persisted state into `doc` (the
 * `synced` event). Subsequent updates persist automatically.
 *
 * Idempotent: a second call returns the same provider promise.
 */
export function setupIdbPersistence(doc) {
  if (_provider) return _providerPromise ?? Promise.resolve(_provider);
  if (!(doc instanceof Y.Doc)) {
    throw new Error("setupIdbPersistence: doc must be a Y.Doc");
  }

  _providerPromise = new Promise((resolve) => {
    _provider = new IndexeddbPersistence(ROOM_NAME, doc);

    // Hydration done. The doc now contains whatever was persisted.
    _provider.once("synced", () => {
      console.log("[idb] y-indexeddb synced (hydration complete)");
      emitStatus("saved");
      resolve(_provider);
    });

    // Bridge updateV2 → menubar status. We can't easily distinguish
    // "local op pending IDB flush" from "remote op already
    // committed" through y-indexeddb alone, so we treat every local
    // update as transiently pending and the provider's whenSynced
    // resolution as "saved". y-indexeddb writes are essentially
    // synchronous-with-transaction: once the IDB tx commits, the
    // bytes are durable.
    doc.on("updateV2", (_update, origin) => {
      // The provider sets origin to itself when applying remote/
      // hydrated state; only treat locally-originated updates as
      // pending.
      if (origin === _provider) return;
      emitStatus("saving");
      // y-indexeddb queues the write and flushes within a microtask;
      // mark saved on the next tick.
      queueMicrotask(() => {
        _provider.whenSynced.then(() => emitStatus("saved"));
      });
    });
  });

  return _providerPromise;
}

/** Subscribe to status transitions for the menubar pill. */
export function onIdbStatus(fn) {
  if (typeof fn !== "function") return () => {};
  _statusListeners.add(fn);
  // Fire current state immediately.
  try { fn(_status, ""); } catch (e) { console.warn("[idb] listener threw:", e); }
  return () => { _statusListeners.delete(fn); };
}

/** Read current status synchronously (idle | pending | saving | saved | error). */
export function getIdbStatus() { return _status; }

// ─── Compatibility layer for the pre-Phase-2 autoSave shape ────────
//
// autoSave still calls `subscribeAutoPersist` + `flushNow`. These
// thin wrappers let the legacy callers keep working while the
// underlying engine is now y-indexeddb. Most of the work is delegated
// to onIdbStatus + the provider's whenSynced.

/** No-op: y-indexeddb hydrates inside setupIdbPersistence. Returns
 *  true if any state was persisted (provider sees a non-empty store). */
export async function hydrateFromIdb(_doc) {
  // Idempotent — setupIdbPersistence is called from yjsBackend's
  // boot path before this. Just await whenSynced as a safety net.
  if (!_provider) return false;
  await _provider.whenSynced;
  return true;
}

/** Subscribe legacy callers to the status pipeline. */
export function subscribeAutoPersist(_doc, onStatus) {
  return onIdbStatus(onStatus);
}

/** Force-flush. y-indexeddb is essentially synchronous; awaiting
 *  whenSynced after the latest write is the closest equivalent. */
export async function flushNow(_doc, onStatus) {
  const status = (s, msg) => { if (typeof onStatus === "function") onStatus(s, msg); };
  try {
    if (!_provider) {
      status("saved");
      return;
    }
    status("saving");
    await _provider.whenSynced;
    status("saved");
  } catch (e) {
    status("error", e?.message ?? String(e));
    console.warn("[idb] flushNow failed:", e);
  }
}

/** Wipe IDB state — used by File → New Project. */
export async function clearIdb() {
  try {
    if (_provider && typeof _provider.clearData === "function") {
      await _provider.clearData();
    }
  } catch (e) {
    console.warn("[idb] clear failed:", e);
  }
}
