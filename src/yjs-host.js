// Side-effect import. Assigning `globalThis.__wb_yjs` here (instead of as a
// top-level statement in main.js) guarantees the assignment runs BEFORE any
// later import — ESM hoists imports above statements, so a `globalThis.* =`
// in main.js's body fires after `virtual:workbook-runtime` has already
// evaluated and the runtime's yjsHost.ts has already thrown.
//
// Keep this module's only side effect — DO NOT add other top-level work.
import * as Y from "yjs";
globalThis.__wb_yjs = Y;
