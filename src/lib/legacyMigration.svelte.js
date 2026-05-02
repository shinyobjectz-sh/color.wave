// One-time legacy IDB → file migration.
//
// Pre-substrate, color.wave used y-indexeddb (room name "colorwave-state")
// as its source of truth. Existing users have hours of work locked in
// that database. This module detects that legacy state on boot and
// offers a one-time export: load the legacy bytes into a fresh Y.Doc,
// download them as a substrate-format .workbook.html, and (on user
// confirmation) clear the legacy IDB.
//
// Migration runs ONCE per browser. If user dismisses the toast, we
// stash a flag and don't show it again unless they manually clear
// localStorage.

import * as Y from "yjs";
import { wbSubstrate } from "./substrateBackend.svelte.js";

const LEGACY_ROOM = "colorwave-state";
const SEEN_KEY = "wb-substrate.legacy-migration-seen";

/** Detect: does the browser have non-empty legacy IDB state we should
 *  surface to the user? */
export async function detectLegacyState() {
  if (typeof indexedDB === "undefined") return false;
  // y-indexeddb stores updates in a database named after the room.
  // We check existence + non-empty content via a low-level open.
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(LEGACY_ROOM);
    } catch (e) {
      resolve(false);
      return;
    }
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const db = req.result;
      try {
        // y-indexeddb's object store name is "updates"
        if (!db.objectStoreNames.contains("updates")) {
          db.close();
          resolve(false);
          return;
        }
        const tx = db.transaction("updates", "readonly");
        const store = tx.objectStore("updates");
        const countReq = store.count();
        countReq.onsuccess = () => {
          const has = countReq.result > 0;
          db.close();
          resolve(has);
        };
        countReq.onerror = () => { db.close(); resolve(false); };
      } catch (e) {
        try { db.close(); } catch {}
        resolve(false);
      }
    };
    req.onupgradeneeded = (ev) => {
      // We didn't intend to create the DB; abort the open if y-indexeddb
      // hasn't already created it.
      try { ev.target.transaction.abort(); } catch {}
      resolve(false);
    };
  });
}

/** Read legacy IDB bytes into a fresh Y.Doc and return the encoded
 *  state-as-update. Returns null if anything fails. */
async function loadLegacyDocBytes() {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(LEGACY_ROOM);
    } catch (e) {
      resolve(null);
      return;
    }
    req.onerror = () => resolve(null);
    req.onsuccess = async () => {
      const db = req.result;
      try {
        const tx = db.transaction("updates", "readonly");
        const store = tx.objectStore("updates");
        const all = store.getAll();
        all.onsuccess = () => {
          const updates = all.result ?? [];
          db.close();
          if (updates.length === 0) {
            resolve(null);
            return;
          }
          const doc = new Y.Doc();
          for (const u of updates) {
            const bytes =
              u instanceof Uint8Array
                ? u
                : (u?.update instanceof Uint8Array ? u.update : null);
            if (bytes) {
              try { Y.applyUpdate(doc, bytes); } catch { /* skip malformed */ }
            }
          }
          resolve(Y.encodeStateAsUpdateV2(doc));
        };
        all.onerror = () => { db.close(); resolve(null); };
      } catch (e) {
        try { db.close(); } catch {}
        resolve(null);
      }
    };
  });
}

/** Clear all known legacy IDB databases. Call after the user has
 *  successfully exported. */
async function clearLegacyIdb() {
  if (typeof indexedDB === "undefined") return;
  try {
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(LEGACY_ROOM);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve(); // close handles, ignore
    });
  } catch (e) {
    console.warn("[legacy-migration] clear failed:", e);
  }
}

/** Mount the migration toast if legacy state exists and we haven't
 *  shown it yet. Idempotent — safe to call on every boot. */
export async function maybeMountMigrationToast() {
  if (typeof document === "undefined") return;
  if (localStorage.getItem(SEEN_KEY) === "1") return;
  const has = await detectLegacyState();
  if (!has) {
    localStorage.setItem(SEEN_KEY, "1");
    return;
  }

  const root = document.createElement("aside");
  root.id = "wb-legacy-migration-toast";
  root.style.cssText = [
    "position:fixed",
    "top:24px",
    "right:24px",
    "z-index:2147483645",
    "max-width:420px",
    "background:#18181b",
    "color:#fafafa",
    "border:1px solid #f59e0b",
    "border-radius:10px",
    "padding:14px 16px",
    "box-shadow:0 8px 32px rgba(0,0,0,0.4)",
    "font:13px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif",
  ].join(";");
  root.innerHTML = `
    <strong style="display:block;margin-bottom:4px;color:#f59e0b">Legacy state detected</strong>
    <p style="margin:0 0 10px;color:#a1a1aa">
      This browser has work saved from before the file-as-database update.
      Download it as a workbook to keep editing — the saved file IS your
      project from now on.
    </p>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button id="wb-legacy-skip"
        style="padding:6px 10px;background:transparent;color:#71717a;border:1px solid transparent;border-radius:6px;cursor:pointer;font:inherit">Not now</button>
      <button id="wb-legacy-export"
        style="padding:6px 12px;background:#f59e0b;color:#09090b;border:1px solid #f59e0b;border-radius:6px;cursor:pointer;font:inherit;font-weight:600">Download my work</button>
    </div>
  `;
  document.body.appendChild(root);

  const exportBtn = root.querySelector("#wb-legacy-export");
  const skipBtn = root.querySelector("#wb-legacy-skip");

  skipBtn.addEventListener("click", () => {
    // Skip = "ask me again next session". We don't set SEEN_KEY here;
    // the user might want to do it on a different machine first or
    // think it over.
    root.remove();
  });

  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = "Preparing…";
    try {
      const bytes = await loadLegacyDocBytes();
      if (!bytes || bytes.length === 0) {
        exportBtn.textContent = "Nothing to export";
        setTimeout(() => root.remove(), 1500);
        localStorage.setItem(SEEN_KEY, "1");
        return;
      }

      // Build a fresh substrate-format file from the legacy bytes.
      const html = await buildLegacyExportHtml(bytes);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = legacyExportFilename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // Mark seen + clear legacy IDB after a brief pause so the user's
      // download initiates first.
      localStorage.setItem(SEEN_KEY, "1");
      exportBtn.textContent = "Downloaded ✓";
      setTimeout(async () => {
        await clearLegacyIdb();
        root.remove();
      }, 2000);
    } catch (e) {
      console.error("[legacy-migration] export failed:", e);
      exportBtn.textContent = "Failed; retry";
      exportBtn.disabled = false;
    }
  });
}

/** Build a fresh substrate workbook HTML from a legacy Y.Doc snapshot.
 *  We generate a workbook with a single composition snapshot containing
 *  the legacy bytes; the WAL is empty. The runtime + app code is the
 *  current document's HTML (since the user just loaded that and can
 *  re-open a workbook of the same vintage). */
async function buildLegacyExportHtml(bytes) {
  const { cidOf } = await import("@work.books/substrate");
  const cid = await cidOf(bytes);
  const workbookId = generateLegacyExportId();

  const meta = {
    workbook_id: workbookId,
    substrate_version: "v0",
    schema_version: 0,
    compaction_seq: 0,
    snapshot_cid_by_target: { composition: cid },
    created_at: new Date().toISOString(),
    note: "exported-from-legacy-idb",
  };

  const b64 = btoa(String.fromCharCode(...bytes));
  const slots = [
    `<meta name="workbook-substrate" content="v0">`,
    `<script type="application/json" id="wb-meta">${JSON.stringify(meta)}</script>`,
    `<script type="application/octet-stream" id="wb-snapshot:composition" data-cid="${cid}" data-format="yjs" data-byte-length="${bytes.length}">${b64}</script>`,
    `<script type="application/json" id="wb-wal">[]</script>`,
  ].join("\n");

  // Take a snapshot of the current document, strip any existing
  // substrate slots, inject our fresh ones in their place.
  const doc = document.cloneNode(true);
  for (const el of [...doc.querySelectorAll(`script[id="wb-meta"], script[id="wb-wal"], script[id^="wb-snapshot:"], meta[name="workbook-substrate"]`)]) {
    el.remove();
  }
  if (doc.head) {
    doc.head.insertAdjacentHTML("beforeend", slots);
  }
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

function legacyExportFilename() {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `colorwave-legacy-${ts}.workbook.html`;
}

function generateLegacyExportId() {
  const ALPH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const ts = Date.now();
  const tsChars = [];
  let n = ts;
  for (let i = 0; i < 10; i++) {
    tsChars.unshift(ALPH[n % 32]);
    n = Math.floor(n / 32);
  }
  const rand = crypto.getRandomValues(new Uint8Array(16));
  const randChars = [];
  for (let i = 0; i < 16; i++) randChars.push(ALPH[rand[i] % 32]);
  return tsChars.join("") + randChars.join("");
}
