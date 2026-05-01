// Auto-save — every Loro commit auto-persists to IndexedDB. No file
// dialogs, no FSA, no user gesture required. The .workbook.html is
// just the app bundle; user state lives in browser IDB.
//
// Cmd+S is intercepted to suppress the browser's "Save Page As"
// (which would snapshot a stale DOM); shows a small toast confirming
// auto-save is on. File export for sharing is a separate explicit
// flow (File → Export…), not coupled to Cmd+S.

import { bootstrapLoro, getDoc } from "./loroBackend.svelte.js";
import {
  hydrateFromIdb,
  subscribeAutoPersist,
  flushNow,
} from "./idbPersistence.svelte.js";

class AutoSaveStore {
  // "idle" | "pending" | "saving" | "saved" | "error"
  status       = $state("idle");
  lastSavedAt  = $state(0);
  errorMessage = $state("");

  _booted = false;
  _doc    = null;

  async init() {
    if (this._booted) return;
    this._booted = true;

    try {
      await bootstrapLoro();
    } catch (e) {
      console.warn("[autosave] bootstrap failed:", e);
      this.status = "error";
      this.errorMessage = "Loro bootstrap failed";
      return;
    }

    const doc = getDoc();
    if (!doc) {
      this.status = "error";
      this.errorMessage = "Loro doc unavailable";
      return;
    }
    this._doc = doc;

    // Hydrate first — pull any prior session's snapshot from IDB so
    // the user sees their work before subscriptions kick in.
    const hydrated = await hydrateFromIdb(doc);
    this.status = hydrated ? "saved" : "idle";
    if (hydrated) this.lastSavedAt = Date.now();

    // Subscribe to local commits → debounced snapshot to IDB.
    subscribeAutoPersist(doc, (status, msg) => {
      this.status = status;
      if (status === "saved") this.lastSavedAt = Date.now();
      if (status === "error") this.errorMessage = msg ?? "";
    });

    // Override SDK's window.workbookSave (the FSA write path) with a
    // no-op-with-toast: the browser's Cmd+S Save Page As is already
    // intercepted by the SDK keydown handler and routes here. Show a
    // confirmation that auto-save is on instead of triggering a Save
    // As dialog. Force-flush IDB while we're at it for paranoia.
    window.workbookSave = async () => {
      console.log("[autosave] cmd-s intercepted → flushing now");
      if (this._doc) await flushNow(this._doc, (s, m) => {
        this.status = s;
        if (s === "saved") this.lastSavedAt = Date.now();
        if (s === "error") this.errorMessage = m ?? "";
      });
      showAutoSaveToast();
    };
  }

  /** Used by File → Save and the menubar pill. Same effect as Cmd+S
   *  — flush IDB now and show the toast. */
  async saveNow() {
    if (typeof window.workbookSave === "function") {
      await window.workbookSave();
    }
  }
}

let _toastEl = null;
let _toastTimer = null;

function showAutoSaveToast() {
  if (typeof document === "undefined") return;
  if (!_toastEl) {
    _toastEl = document.createElement("div");
    _toastEl.id = "cw-autosave-toast";
    _toastEl.style.cssText =
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(8px);" +
      "background:var(--color-surface,#18181b);color:var(--color-fg,#fafafa);" +
      "padding:8px 14px;border:1px solid var(--color-border,#27272a);border-radius:6px;" +
      "font:500 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "letter-spacing:.02em;box-shadow:0 4px 12px rgba(0,0,0,.45);" +
      "opacity:0;transition:opacity .15s ease, transform .15s ease;" +
      "pointer-events:none;z-index:2147483647;";
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = "saves automatically — your work is always persisted";
  requestAnimationFrame(() => {
    _toastEl.style.opacity = "1";
    _toastEl.style.transform = "translateX(-50%) translateY(0)";
  });
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    _toastEl.style.opacity = "0";
    _toastEl.style.transform = "translateX(-50%) translateY(8px)";
  }, 1800);
}

export const autoSave = new AutoSaveStore();
