// Entry — mount the workbook runtime first so the <wb-doc> in
// index.html gets parsed + registered with a Y.Doc handle, then bootstrap
// the substrate (file-as-database) layer, then mount the Svelte app.
//
// Substrate replaces the prior y-indexeddb-as-database setup: state
// lives inside the .workbook.html file itself, persisted via the
// active SubstrateTransport (T2 PWA-FSA / T3 session-FSA / T4 OPFS+
// download / T5 read-only).
//
// Order matters:
//   1. loadRuntime() + mountHtmlWorkbook() — Y.Doc handle becomes
//      available via window.__wbRuntime.
//   2. wbSubstrate.bootstrap() — parse substrate slots from the
//      file's HTML, hydrate the Y.Doc from <wb-snapshot:composition>
//      bytes + replay <wb-wal>, attach the auto-emit Y.Doc listener,
//      pick a transport via negotiate().
//   3. autoSave.init() — wires window.workbookSave to substrate's
//      commitNow(); subscribes to transport status for the menubar
//      indicator.
//   4. mount App — dynamic import so composition.svelte.js evaluates
//      AFTER substrate has hydrated the Y.Doc with the file's state.

// Yjs needs to be on globalThis BEFORE @work.books/runtime evaluates.
// Bare side-effect import — keep it first.
import * as Y from "yjs";
globalThis.__wb_yjs = Y;

import { mount } from "svelte";
import { loadRuntime } from "virtual:workbook-runtime";
import { wbSubstrate } from "./lib/substrateBackend.svelte.js";
import { autoSave } from "./lib/autoSave.svelte.js";
import { maybeMountMigrationToast } from "./lib/legacyMigration.svelte.js";

(async () => {
  try {
    const { wasm, bundle } = await loadRuntime();
    await bundle.mountHtmlWorkbook({
      loadWasm: () => Promise.resolve(wasm),
    });
    await wbSubstrate.bootstrap();
    await autoSave.init();
  } catch (e) {
    console.error("color.wave: runtime/substrate bootstrap failed:", e);
    // Continue with whatever state we have — UI stays operable.
  }

  // Dynamic import: composition.svelte.js calls wb.text("composition",
  // {...}) at module-load. wb.text's readyPromise sees a Y.Doc that's
  // already been hydrated from the file's substrate snapshot+WAL, so
  // it doesn't seed INITIAL_COMPOSITION on top of restored state.
  const { default: App } = await import("./App.svelte");
  mount(App, { target: document.getElementById("app") });

  // One-time post-mount: surface the legacy IDB → file migration if
  // the browser still has pre-substrate state. Idempotent; gated by
  // localStorage flag.
  maybeMountMigrationToast().catch((e) => {
    console.warn("[main] legacy migration check failed:", e);
  });

  // Forward "save" messages from the composition iframe to the SDK's
  // save handler. The iframe is sandboxed and captures Cmd+S when it
  // has focus; its bootstrap catches the keypress and posts here.
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
