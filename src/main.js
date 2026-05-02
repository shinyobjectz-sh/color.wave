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
// Yjs MUST be on globalThis before `virtual:workbook-runtime` evaluates —
// the runtime's yjsHost.ts reads `globalThis.__wb_yjs` at module init time
// and throws if it's missing. Importing yjs-host.js as a side-effect (with
// no value binding) makes the assignment run as part of the import phase,
// BEFORE the imports below evaluate. A bare `globalThis.* =` in this file's
// body would not, because ESM hoists imports above statements.
import "./yjs-host.js";

import { mount } from "svelte";
import App from "./App.svelte";
import { loadRuntime } from "virtual:workbook-runtime";
import { bootstrapYjs } from "./lib/yjsBackend.svelte.js";
import { autoSave } from "./lib/autoSave.svelte.js";

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
