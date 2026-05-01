// IndexedDB-backed persistence for the Loro doc.
//
// Architecture:
//   • The .workbook.html file is just the APP BUNDLE. User projects
//     (compositions, plugins, configs, history) live in browser IDB.
//   • Every Loro commit triggers a debounced snapshot-to-IDB write.
//   • On boot, hydrate the Loro doc from IDB if a snapshot exists.
//
// This replaces the previous "save = write back to .workbook.html
// via FSA" flow. There are no file dialogs anymore. File export for
// sharing is a separate explicit action (File → Export…).

const DB_NAME      = "colorwave";
const DB_VERSION   = 1;
const STORE_NAME   = "state";
const SNAPSHOT_KEY = "loro-snapshot";
const DEBOUNCE_MS  = 600;

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("IDB upgrade blocked"));
  });
  // Don't cache rejection — let the next caller retry.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

async function readSnapshot() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function writeSnapshot(bytes) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(bytes, SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/**
 * Restore the Loro doc from IDB if a snapshot exists. Returns true if
 * a snapshot was found and applied, false otherwise. Errors swallow
 * to a console warn — better to start fresh than block boot.
 */
export async function hydrateFromIdb(loroDoc) {
  try {
    const bytes = await readSnapshot();
    if (!bytes || !(bytes instanceof Uint8Array) || bytes.length === 0) return false;
    loroDoc.import(bytes);
    console.log(`[idb] hydrated Loro doc from IDB (${bytes.length} bytes)`);
    return true;
  } catch (e) {
    console.warn("[idb] hydrate failed:", e);
    return false;
  }
}

/**
 * Subscribe to local Loro commits and write a debounced snapshot to
 * IDB. Returns an unsubscribe function. The caller is responsible for
 * invoking that on teardown (rare; typically lives for the page life).
 *
 * onStatus is invoked with one of "pending" | "saving" | "saved" |
 * "error" + optional error message — drives the menubar indicator.
 */
export function subscribeAutoPersist(loroDoc, onStatus) {
  let timer = null;
  let unsubscribed = false;

  const status = (s, msg) => { if (typeof onStatus === "function") onStatus(s, msg); };

  const flush = async () => {
    if (unsubscribed) return;
    try {
      status("saving");
      const bytes = loroDoc.export({ mode: "snapshot" });
      await writeSnapshot(bytes);
      status("saved");
    } catch (e) {
      status("error", e?.message ?? String(e));
      console.warn("[idb] write failed:", e);
    }
  };

  const unsubLoro = loroDoc.subscribe((ev) => {
    if (ev?.by !== "local") return;
    status("pending");
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });
  console.log("[idb] subscribed to Loro local commits → autopersist");

  return () => {
    unsubscribed = true;
    if (timer) clearTimeout(timer);
    if (typeof unsubLoro === "function") unsubLoro();
  };
}

/** Force an immediate snapshot to IDB, bypassing the debounce. Used
 *  by Cmd+S as a "make sure I'm saved right now" gesture. */
export async function flushNow(loroDoc, onStatus) {
  const status = (s, msg) => { if (typeof onStatus === "function") onStatus(s, msg); };
  try {
    status("saving");
    const bytes = loroDoc.export({ mode: "snapshot" });
    await writeSnapshot(bytes);
    status("saved");
  } catch (e) {
    status("error", e?.message ?? String(e));
    console.warn("[idb] flushNow failed:", e);
  }
}

/** Wipe IDB state — used by File → New Project. */
export async function clearIdb() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[idb] clear failed:", e);
  }
}
