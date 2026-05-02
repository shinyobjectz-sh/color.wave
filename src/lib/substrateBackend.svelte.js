// Substrate backend bootstrap for color.wave.
//
// Replaces the y-indexeddb provider that previously made browser cache
// the source of truth. Now: the .workbook.html file IS the database.
// State (yjs Y.Doc bytes for the composition + future targets) lives
// inline in the file. Every Y.Doc updateV2 event is captured as a WAL
// op; debounced commits flow through the active substrate transport
// (T2 / T3 / T4 / T5) to write the file back to disk.
//
// Public surface:
//   wbSubstrate.bootstrap()  — call once during app boot
//   wbSubstrate.transport    — active SubstrateTransport (for status)
//   wbSubstrate.commitNow()  — manual flush (Cmd+S, etc.)
//   wbSubstrate.shouldCompact() — heuristic
//
// See vendor/workbooks/docs/SUBSTRATE_FORMAT_V0.md for the file format.

import * as Y from "yjs";
import {
  parseSubstrateFromDocument,
  createMutator,
  bindYjsAutoEmit,
  negotiate,
  compact,
  shouldCompact,
  cidOf,
} from "@work.books/substrate";
import { markDocHydrated } from "@work.books/runtime/storage";
import { bootstrapYjs, getDoc } from "./yjsBackend.svelte.js";

const DEBOUNCE_MS = 250;
const COMPACTION_OP_THRESHOLD = 100;

class WbSubstrate {
  /** @type {import("@work.books/substrate").SubstrateTransport | null} */
  transport = null;
  /** @type {import("@work.books/substrate").SubstrateMutator | null} */
  mutator = null;
  /** @type {string | null} — workbook_id for telemetry */
  workbookId = null;

  _booted = false;
  _commitTimer = null;
  _unbindAutoEmit = null;
  _bodyTemplate = null;     // cached HTML shell with substrate slots stripped
  _docHydrated = false;

  async bootstrap() {
    if (this._booted) return;
    this._booted = true;

    // 1. Wait for the runtime's <wb-doc> registration to land a Y.Doc.
    await bootstrapYjs();
    const doc = getDoc();
    if (!(doc instanceof Y.Doc)) {
      console.warn("[substrate] no Y.Doc; running in read-only mode");
      return;
    }

    // 2. Parse substrate slots from the current document. This is the
    // authoritative state — we hydrate the Y.Doc from the file's
    // <wb-snapshot> bytes + replay <wb-wal> ops.
    let file;
    try {
      file = await parseSubstrateFromDocument(document);
    } catch (e) {
      // No substrate slots in this file → first-edit case, build a
      // minimal empty SubstrateFile in memory. The first commit will
      // populate the slots in the on-disk image.
      console.log("[substrate] no slots in file; bootstrapping fresh", e?.code);
      file = await emptySubstrateFile();
    }

    this.workbookId = file.meta.workbook_id;

    // 3. Hydrate the Y.Doc from the substrate snapshot + WAL.
    const compSnap = file.snapshots.get("composition");
    if (compSnap?.format === "yjs" && compSnap.bytes.length > 0) {
      Y.applyUpdateV2(doc, compSnap.bytes);
    }
    for (const op of file.wal) {
      if (op.target === "composition") {
        Y.applyUpdateV2(doc, op.payload);
      }
    }
    this._docHydrated = true;
    // Signal seed-on-empty primitives (wb.text, etc.) that the
    // saved state has landed. Anyone awaiting hydration unblocks
    // here. Without this, wb.text("composition", { initial }) would
    // see an empty Y.Text before WAL apply and seed a duplicate
    // copy on top of the restored state.
    markDocHydrated(null);

    // 4. Pick a transport. Negotiator detects PWA / FSA / OPFS / nothing.
    const { transport } = await negotiate({
      workbookId: this.workbookId,
      downloadFilename: guessFilename(),
    });
    this.transport = transport;

    // 5. Wire the mutator. Y.Doc updates → WAL ops → debounced commits.
    this.mutator = createMutator(file);
    this._unbindAutoEmit = bindYjsAutoEmit(this.mutator, { Y, doc, target: "composition" });
    this.mutator.onCommit(() => this._scheduleCommit());

    // 6. Cache the body template for fast image rebuild on each commit.
    this._bodyTemplate = captureBodyTemplate();
  }

  _scheduleCommit() {
    if (this._commitTimer) clearTimeout(this._commitTimer);
    this._commitTimer = setTimeout(() => {
      this._commitTimer = null;
      this.commitNow().catch((e) => {
        console.warn("[substrate] commit failed:", e);
      });
    }, DEBOUNCE_MS);
  }

  async commitNow() {
    if (!this.transport || !this.mutator) {
      return { kind: "queued", reason: "substrate not bootstrapped" };
    }

    // Compact if needed BEFORE building the image.
    const needsCompaction =
      shouldCompact(this.mutator.file, (f) => f.wal.length > COMPACTION_OP_THRESHOLD);
    if (needsCompaction) {
      const compacted = await compact(this.mutator.file, {
        encode: async (target /*, snap, walOps */) => {
          // For the "composition" target: the runtime has the
          // post-replay state in its Y.Doc, so we encode that directly.
          // (snap+walOps round-tripped through the doc on bootstrap.)
          if (target === "composition") {
            const doc = getDoc();
            return Y.encodeStateAsUpdateV2(doc);
          }
          // Other targets: not yet implemented (sqlite hydration is
          // a follow-up). Return empty bytes; the substrate will
          // simply re-emit a zero-byte snapshot until that target
          // gets a real encoder.
          return new Uint8Array(0);
        },
      });
      this.mutator.replaceFile(compacted);
    }

    const html = await this._buildImage();
    const fingerprint = this.mutator.file.fingerprint;
    const result = await this.transport.commitPatch({
      expectedFingerprint: fingerprint,
      newImage: { html, byteLength: html.length, fingerprint },
      mode: "rewrite-required",
    });
    return result;
  }

  /** Assemble the full HTML to write to disk. */
  async _buildImage() {
    const meta = this.mutator.file.meta;
    const snapshots = this.mutator.file.snapshots;
    const wal = this.mutator.file.wal;

    const metaBlock = `<script type="application/json" id="wb-meta">${JSON.stringify(meta)}</script>`;
    const snapshotBlocks = [...snapshots.values()].map((s) => {
      const b64 = btoa(String.fromCharCode(...s.bytes));
      return `<script type="application/octet-stream" id="wb-snapshot:${s.target}" data-cid="${s.cid}" data-format="${s.format}">${b64}</script>`;
    }).join("\n");
    const walBlock = `<script type="application/json" id="wb-wal">${JSON.stringify(wal.map(opToJson))}</script>`;

    const headInjection = [
      `<meta name="workbook-substrate" content="v0">`,
      metaBlock,
      snapshotBlocks,
      walBlock,
    ].filter(Boolean).join("\n");

    return this._bodyTemplate.replace(SUBSTRATE_SLOT_MARKER, headInjection);
  }
}

function opToJson(op) {
  return {
    seq: op.seq,
    target: op.target,
    parent_cid: op.parent_cid,
    cid: op.cid,
    ts: op.ts,
    payload_b64: btoa(String.fromCharCode(...op.payload)),
  };
}

const SUBSTRATE_SLOT_MARKER = "<!--wb-substrate-slots-->";

/** Capture the document's outer HTML with substrate slots replaced by
 *  a marker so we can reinject fresh slots on each commit without
 *  losing the runtime/app code. */
function captureBodyTemplate() {
  // Clone document, strip any existing substrate scripts, leave a
  // marker comment in their place.
  const doc = document.cloneNode(true);
  const stripIds = ["wb-meta", "wb-wal"];
  const stripPrefix = "wb-snapshot:";
  let firstStripped = null;
  for (const el of [...doc.querySelectorAll("script")]) {
    const id = el.getAttribute("id") ?? "";
    if (stripIds.includes(id) || id.startsWith(stripPrefix)) {
      if (!firstStripped) firstStripped = el;
      el.remove();
    }
  }
  // Remove any existing substrate-meta tag.
  for (const m of [...doc.querySelectorAll('meta[name="workbook-substrate"]')]) {
    if (!firstStripped) firstStripped = m;
    m.remove();
  }

  // Inject marker into the head.
  const head = doc.head;
  if (head) {
    head.insertAdjacentHTML("beforeend", SUBSTRATE_SLOT_MARKER);
  }
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}

async function emptySubstrateFile() {
  // Used when the loaded document has no substrate slots. The build
  // tool should always emit them, but handle the bare case so dev
  // workflows (npm run dev without build) don't crash.
  return {
    meta: {
      workbook_id: ensureWorkbookId(),
      substrate_version: "v0",
      schema_version: 0,
      compaction_seq: 0,
      snapshot_cid_by_target: {},
    },
    snapshots: new Map(),
    wal: [],
    fingerprint: await cidOf(""),
  };
}

function ensureWorkbookId() {
  // Read from <meta name="wb-build-id"> if the build tool injected one;
  // otherwise generate a session-local placeholder. NOT durable across
  // page reloads in dev mode (which is fine — dev mode doesn't persist
  // through the substrate anyway).
  const meta = document.querySelector('meta[name="wb-build-id"]');
  if (meta) return meta.content;
  return "01J0DEV-" + Math.random().toString(36).slice(2, 18).toUpperCase().padEnd(18, "X");
}

function guessFilename() {
  if (typeof location === "undefined") return "workbook.html";
  const last = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  if (last.endsWith(".workbook.html")) return last;
  if (last.endsWith(".html")) return last;
  return "workbook.html";
}

export const wbSubstrate = new WbSubstrate();
