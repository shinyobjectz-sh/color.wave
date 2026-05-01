// Entry — mount the workbook runtime first so the <wb-doc> in
// index.html gets parsed + registered with a CRDT handle, then mount
// the Svelte app once persistent state is ready.
//
// Order matters: the studio's yjsBackend reads its Y.Doc from
// window.__wbRuntime.getDocHandle("hyperframes-state"), which only
// exists after mountHtmlWorkbook() resolves. Awaiting both before
// Svelte mount eliminates the brief default-state flash that the
// prior IDB-bootstrap flow had.
//
// Persistence: a `y-indexeddb` provider attached inside yjsBackend
// streams every Y.Doc update to IDB and rehydrates on load. State
// also lives in the <wb-doc> element on disk for portable export
// (Cmd+S round-trip).
//
// Wrapped in an async IIFE rather than top-level await so the
// module evaluates without TLA semantics — vite-plugin-singlefile
// flattens chunks in a way that interacts poorly with TLA wrappers.
import { mount } from "svelte";
import App from "./App.svelte";
import { loadRuntime } from "virtual:workbook-runtime";
import { bootstrapYjs } from "./lib/yjsBackend.svelte.js";
import { autoSave } from "./lib/autoSave.svelte.js";
// Static yjs import keeps the module init order stable through
// vite-plugin-singlefile's flatten step. Same pattern that the
// pre-Phase-2 build used for `loro-crdt`. We don't reference the
// imported namespace; it's purely a sequence guarantee. The runtime's
// <wb-doc> resolver creates the Y.Doc itself via yjsSidecar.
import "yjs";

(async () => {
  try {
    // Load + mount the workbook runtime. Registers <wb-doc> with the
    // runtime client and exposes window.__wbRuntime for tooling
    // (save handler, yjsBackend).
    const { wasm, bundle } = await loadRuntime();
    await bundle.mountHtmlWorkbook({
      loadWasm: () => Promise.resolve(wasm),
    });

    // Hand the runtime-registered Y.Doc handle to yjsBackend so the
    // studio's existing API (getDoc / snapshotCompositionBytes) keeps
    // working unchanged. Side effects: legacy Loro IDB port + y-
    // indexeddb provider attach.
    await bootstrapYjs();

    // Auto-save: subscribe to y-indexeddb provider events so the
    // menubar status pill updates on every persisted update.
    await autoSave.init();
  } catch (e) {
    console.error("color.wave: runtime bootstrap failed:", e);
    // Continue anyway with empty state — the app is still usable;
    // composition starts from INITIAL_COMPOSITION rather than
    // restored bytes.
  }
  mount(App, { target: document.getElementById("app") });

  // Forward "save" messages from the composition iframe to the SDK's
  // save handler. The iframe is sandboxed and captures Cmd+S when it
  // has focus; its bootstrap (initial.js → IFRAME_RUNTIME) catches
  // the keypress and posts here. window.workbookSave is exposed by
  // the SDK saveHandler.mjs at runtime.
  window.addEventListener("message", (ev) => {
    if (ev.data?.type !== "save") return;
    console.log("[save] received iframe-forwarded save request");
    if (typeof window.workbookSave === "function") {
      window.workbookSave();
    } else {
      console.warn("[save] iframe forwarded save but window.workbookSave is undefined");
    }
  });

})();
