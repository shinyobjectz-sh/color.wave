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
// MUST be first: publishes globalThis.__wb_yjs as a side effect so
// that any subsequent import of `@work.books/runtime` (whose yjsHost
// shim reads the global at module-top-level) doesn't throw. Bare
// side-effect import — don't move it.
import "./lib/yjsGlobal.js";

import { mount } from "svelte";
import { loadRuntime } from "virtual:workbook-runtime";
import { bootstrapYjs } from "./lib/yjsBackend.svelte.js";
import { autoSave } from "./lib/autoSave.svelte.js";

// IMPORTANT: App.svelte is dynamic-imported INSIDE the IIFE below — not
// statically up here. composition.svelte.js calls `wb.text("composition",
// { initial: INITIAL_COMPOSITION })` at module-load time. wb.text's
// readyPromise resolves as soon as the Y.Doc is registered (during
// mountHtmlWorkbook) and seeds INITIAL_COMPOSITION if the Y.Text is empty.
// IndexedDB hydration runs LATER inside bootstrapYjs(), so a static App
// import would race: wb.text seeds the initial → IDB applies persisted
// state on top → clips appear duplicated on every refresh. Dynamic-
// importing App after bootstrapYjs() finishes guarantees composition.js
// evaluates against a Y.Doc that's already been hydrated from IDB.

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
    // indexeddb provider attach + awaits whenSynced.
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

  // Dynamic import — see note above. Composition store evaluates here,
  // AFTER the Y.Doc has been hydrated from IndexedDB.
  const { default: App } = await import("./App.svelte");
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
