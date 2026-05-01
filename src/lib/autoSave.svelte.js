// Auto-save status bridge. Phase 2 (Yjs) uses a `y-indexeddb`
// provider for the actual persistence — this module no longer owns
// the snapshot loop. Its remaining responsibilities:
//
//   1. Reflect the y-indexeddb status into a $state-tracked store the
//      menubar pill subscribes to.
//   2. Surface the user-facing "saves automatically" toast on Cmd+S
//      (called from the iframe forwarder + the menubar pill click).
//   3. Override `window.workbookSave` so the SDK's keydown listener
//      no longer triggers a Save Page As dialog.
//
// Cmd+S is intercepted to suppress the browser's "Save Page As" (which
// would snapshot a stale DOM); shows a small toast confirming auto-
// save is on. File export for sharing is a separate explicit flow
// (File → Export…), not coupled to Cmd+S.

import { bootstrapYjs, getDoc } from "./yjsBackend.svelte.js";
import { onIdbStatus, flushNow } from "./idbPersistence.svelte.js";

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
      await bootstrapYjs();
    } catch (e) {
      console.warn("[autosave] bootstrap failed:", e);
      this.status = "error";
      this.errorMessage = "Yjs bootstrap failed";
      return;
    }

    const doc = getDoc();
    if (!doc) {
      this.status = "error";
      this.errorMessage = "Y.Doc unavailable";
      return;
    }
    this._doc = doc;

    // y-indexeddb's whenSynced + per-update flush drives the status
    // pill. onIdbStatus fires once with the current state on register.
    onIdbStatus((next, msg) => {
      this.status = next;
      if (next === "saved") this.lastSavedAt = Date.now();
      if (next === "error") this.errorMessage = msg ?? "";
    });

    // Override SDK's window.workbookSave (the FSA write path) with a
    // toast-only confirmation: the browser's Cmd+S Save Page As is
    // already intercepted by the SDK keydown handler and routes here.
    // We keep the user-facing reassurance toast — it's a load-bearing
    // signal that "your work is saved" without showing a stale dialog.
    window.workbookSave = async () => {
      console.log("[autosave] cmd-s intercepted → flushing y-indexeddb");
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
