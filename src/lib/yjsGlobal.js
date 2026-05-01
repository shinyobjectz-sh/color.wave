// Side-effect-only module that publishes the host's Yjs instance on
// `globalThis.__wb_yjs` BEFORE any consumer of `@work.books/runtime`
// is evaluated. The runtime's yjsHost.ts shim reads this global at
// module-top-level and throws if missing, so it has to be set during
// the import phase (not in main.js's body — that runs too late).
//
// To keep the ordering guarantee, this file MUST be the first import
// in main.js. ES module evaluation is depth-first in declaration
// order, so imports listed before any `@work.books/runtime` consumer
// finish their bodies first.
//
// Same single-instance rationale as before:
// https://github.com/yjs/yjs/issues/438
import * as Y from "yjs";

globalThis.__wb_yjs = Y;
