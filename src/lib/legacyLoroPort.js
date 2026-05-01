// One-time port of pre-Phase-2 Loro snapshots into a fresh Y.Doc.
//
// Pre-Phase-2 color.wave persisted user state as Loro snapshot bytes
// under the IDB key `colorwave / state / loro-snapshot`. Phase 2
// switched to a y-indexeddb provider keyed `colorwave-state`. Without
// migration, post-upgrade users would see an empty workbook.
//
// This module is lazy-loaded by yjsBackend on first boot. It:
//   1. Probes the legacy IDB store for a Loro snapshot.
//   2. Lazy-imports `loro-crdt` (transient one-time dep — only loaded
//      when the legacy store has bytes; brand-new users never pay).
//   3. Walks the legacy doc's well-known containers
//      (composition, assets, plugins, user-skills) and writes their
//      content into the Y.Doc through Yjs's shared types.
//   4. Drops the legacy IDB store so the port doesn't run again.
//
// Edge cases handled:
//   - No legacy DB: silently skips.
//   - Legacy DB exists but the snapshot is empty / corrupt: skips,
//     logs a warn.
//   - `loro-crdt` install missing: skips with a warn — better to lose
//     pre-Phase-2 state than to fail boot. (Bundle-time analysis
//     should never include this module on the happy path; we treat
//     dynamic import failure as "no migration available".)
//
// What's NOT ported here:
//   - history (Prolly Tree) — that's a separate primitive backed by
//     its own IDB key; untouched by this migration.
//   - chat thread (Arrow IPC memory) — separate IDB key, untouched.

const LEGACY_DB_NAME = "colorwave";
const LEGACY_STORE = "state";
const LEGACY_KEY = "loro-snapshot";
const PORT_MARKER_KEY = "loro-snapshot-ported";

/** Open the legacy IDB. Returns null if the database doesn't exist. */
function openLegacyDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(LEGACY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      // If the DB doesn't exist yet, IDB tries to create it. Abort so
      // we don't materialize a fresh DB during a probe — only proceed
      // if the schema was already there.
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        // Brand-new user — abort and resolve null below.
        req.transaction.abort();
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // treat as "no legacy data"
    req.onblocked = () => reject(new Error("legacy IDB open blocked"));
  });
}

function readLegacyKey(db, key) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(LEGACY_STORE, "readonly"); }
    catch { resolve(null); return; }
    const req = tx.objectStore(LEGACY_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function writeLegacyKey(db, key, value) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(LEGACY_STORE, "readwrite"); }
    catch { resolve(); return; }
    tx.objectStore(LEGACY_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function deleteLegacyKey(db, key) {
  return new Promise((resolve) => {
    let tx;
    try { tx = db.transaction(LEGACY_STORE, "readwrite"); }
    catch { resolve(); return; }
    tx.objectStore(LEGACY_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Probe the legacy IDB and, if a Loro snapshot is present, port its
 * known containers into the supplied Y.Doc. Idempotent — once the
 * port marker is set, subsequent calls are no-ops.
 *
 * Containers ported (matched to the wb.* SDK's id namespace):
 *   - text "composition"          → Y.Text "composition"
 *   - list "assets"               → Y.Array<string> "assets"
 *   - list "plugins"              → Y.Array<string> "plugins"
 *   - list "user-skills"          → Y.Array<string> "user-skills"
 */
export async function runLegacyLoroPortIfPresent(yDoc) {
  if (!yDoc) return;
  let db = null;
  try {
    db = await openLegacyDb();
  } catch {
    return;
  }
  if (!db) return;

  try {
    // Already ported?
    const ported = await readLegacyKey(db, PORT_MARKER_KEY);
    if (ported) return;

    const bytes = await readLegacyKey(db, LEGACY_KEY);
    if (!bytes || !(bytes instanceof Uint8Array) || bytes.length === 0) return;

    let loro;
    try {
      // We deliberately route the dynamic import through `Function`
      // so the bundler can NOT statically resolve "loro-crdt". The
      // entire point of the port being lazy is that brand-new
      // installs don't need loro-crdt at all — and Phase 2's bundle-
      // size win comes from NOT bundling loro's 3 MB WASM. Users on
      // a legacy IDB store who don't ship loro-crdt see a console
      // warn and fall through; their pre-Phase-2 state can still be
      // recovered manually from the legacy IDB key.
      const dynamicImport = new Function("s", "return import(s)");
      loro = await dynamicImport("loro-crdt");
    } catch (e) {
      console.warn(
        "[legacyLoroPort] loro-crdt not available — skipping port; " +
        "your pre-Phase-2 state can be recovered manually from the " +
        "legacy IDB key 'colorwave/state/loro-snapshot'. (" + (e?.message ?? e) + ")",
      );
      return;
    }

    const legacyDoc = new loro.LoroDoc();
    try {
      legacyDoc.import(bytes);
    } catch (e) {
      console.warn("[legacyLoroPort] legacy snapshot unreadable — skipping:", e?.message ?? e);
      return;
    }

    // 1. composition (text container)
    try {
      const legacyText = legacyDoc.getText("composition");
      const value = legacyText.toString();
      if (typeof value === "string" && value.length > 0) {
        const yText = yDoc.getText("composition");
        if (yText.length === 0) {
          yDoc.transact(() => { yText.insert(0, value); });
        }
      }
    } catch (e) {
      console.warn("[legacyLoroPort] composition port failed:", e?.message ?? e);
    }

    // 2. List-shaped containers (JSON-encoded records). Same wire
    //    format the wb.collection SDK uses, so we copy values
    //    string-for-string.
    for (const listId of ["assets", "plugins", "user-skills"]) {
      try {
        const legacyList = legacyDoc.getList(listId);
        const items = legacyList.toArray();
        if (!Array.isArray(items) || items.length === 0) continue;
        const yArray = yDoc.getArray(listId);
        if (yArray.length > 0) continue; // doc already has data; don't clobber
        const encoded = items
          .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
          .filter((v) => typeof v === "string" && v.length > 0);
        if (encoded.length === 0) continue;
        yDoc.transact(() => { yArray.push(encoded); });
      } catch (e) {
        console.warn(`[legacyLoroPort] ${listId} port failed:`, e?.message ?? e);
      }
    }

    // 3. Mark ported + drop the legacy snapshot. Keep the marker
    //    around so a future reset doesn't accidentally re-port stale
    //    bytes; deleting both the snapshot and the marker would let
    //    `colorwave/state/loro-snapshot` re-appear from a partial
    //    write somewhere and re-trigger this loop.
    try {
      await writeLegacyKey(db, PORT_MARKER_KEY, true);
      await deleteLegacyKey(db, LEGACY_KEY);
      console.log("[legacyLoroPort] ported pre-Phase-2 Loro state into Y.Doc");
    } catch (e) {
      console.warn("[legacyLoroPort] cleanup failed:", e?.message ?? e);
    }
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}
