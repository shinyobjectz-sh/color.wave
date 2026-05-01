// Auto-save status bridge — substrate-backed.
//
// Surfaces the active substrate transport's status (saved-in-file /
// needs-permission / download-to-keep / read-only) as a $state-tracked
// store the menubar pill subscribes to.
//
// Wires Cmd+S to a substrate commitPatch via the workbookSave hook the
// SDK's keydown listener calls. The actual write goes through the
// transport returned by substrate's negotiate().

import { wbSubstrate } from "./substrateBackend.svelte.js";

class AutoSaveStore {
  // Mirrors WriteSemantics.status from the substrate transport.
  status       = $state("read-only");
  /** Tier label for diagnostics: T2 / T3 / T4 / T5 */
  tier         = $state("T5");
  lastSavedAt  = $state(0);
  errorMessage = $state("");

  _booted = false;

  async init() {
    if (this._booted) return;
    this._booted = true;

    try {
      await wbSubstrate.bootstrap();
    } catch (e) {
      console.warn("[autosave] substrate bootstrap failed:", e);
      this.status = "read-only";
      this.errorMessage = e?.message ?? "substrate bootstrap failed";
      return;
    }

    const sem = wbSubstrate.transport.semantics();
    this.status = sem.status;
    this.tier = sem.tier;

    wbSubstrate.transport.onStatusChange?.((s) => {
      this.status = s;
      if (s === "saved-in-file") this.lastSavedAt = Date.now();
    });

    // Override SDK's window.workbookSave (the SDK's Cmd+S keydown
    // forwards here). Our save = commitPatch through the substrate
    // transport with the latest in-memory image.
    window.workbookSave = async () => {
      console.log("[autosave] cmd-s intercepted → substrate commitPatch");
      try {
        const result = await wbSubstrate.commitNow();
        if (result.kind === "ok") {
          this.status = "saved-in-file";
          this.lastSavedAt = Date.now();
          showAutoSaveToast("saved");
        } else if (result.kind === "queued") {
          // T4 path — surface the download CTA
          showAutoSaveToast(result.reason ?? "queued — click status pill to download");
        } else if (result.kind === "fingerprint-mismatch") {
          this.errorMessage = "file changed externally; reload";
          showAutoSaveToast("file changed externally — reload to merge");
        } else if (result.kind === "error") {
          this.errorMessage = result.message;
          showAutoSaveToast(`error: ${result.message}`);
        }
      } catch (e) {
        this.errorMessage = e?.message ?? String(e);
        showAutoSaveToast(`save failed: ${this.errorMessage}`);
      }
    };
  }

  /** Used by File → Save and the menubar pill. Same effect as Cmd+S. */
  async saveNow() {
    if (typeof window.workbookSave === "function") {
      await window.workbookSave();
    }
  }
}

let _toastEl = null;
let _toastTimer = null;

function showAutoSaveToast(text) {
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
  _toastEl.textContent = text;
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
