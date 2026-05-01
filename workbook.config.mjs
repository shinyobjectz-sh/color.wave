// color.wave — chat-on-left, player+timeline-on-right.
// An LLM agent edits an HTML video composition; a sandboxed iframe
// renders it; a parsed timeline shows clips with their data-start /
// data-duration. Single-file SPA shipped as a .workbook.html artifact.
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";

export default {
  name: "color.wave",
  slug: "colorwave",
  type: "spa",
  // SPA-shape workbook — no Polars / Plotters / Rhai / Arrow needed.
  // The "app" wasm variant is ~140 KB vs default ~16 MB; drops total
  // workbook size by ~15 MB without losing anything colorwave uses.
  // wb.* + Yjs are pure JS and unaffected by the variant choice.
  wasmVariant: "app",
  // hyperframes-memory tries arrowEncodeJsonRows / appendArrowIpc
  // for compact tensor logging but feature-detects first and degrades
  // gracefully when the arrow surface isn't in this slice. Silence
  // the variant-coverage warning since the call sites are intentional.
  wasmVariantCheck: false,
  version: "0.1",
  entry: "src/index.html",
  vite: {
    // vite-plugin-wasm handles ESM-integrated WASM init for any
    // wasm-bearing dep the runtime crate pulls in. loro-crdt is no
    // longer bundled (Phase 2 swap to Yjs, pure JS); the plugin stays
    // since the workbook-runtime crate ships its own WASM.
    //
    // We deliberately do NOT pair with vite-plugin-top-level-await:
    // vite-plugin-singlefile flattens every module into one inline
    // <script>, and the TLA plugin's IIFE wrapper produces TDZ
    // violations when its variables are read before the wrapper has
    // initialized them. Modern browsers support top-level await
    // natively at the module level, so target=esnext + native TLA
    // is the cleaner path. (If we ever need to support older
    // browsers, we'd need to disable singlefile too.)
    plugins: [tailwindcss(), wasm()],
    build: {
      target: "esnext",
      minify: "terser",
      terserOptions: {
        compress: {
          passes: 3,
          pure_getters: true,
          // unsafe_* flags + ecma:2020 lift removed — they mangled
          // plugin code patterns (palette-swap recoloring broke).
          // Saved ~28 KB total which is negligible against the 25 MB
          // WASM floor. Plain passes=3 + pure_getters keeps a few KB
          // of safe savings without touching method/proto behavior.
          drop_console: false,
        },
        mangle: { properties: false },
        format: {
          // Strip JSDoc / explanatory header comments (we have a lot
          // of them — they survive minification by default).
          comments: false,
        },
      },
    },
    resolve: {
      alias: [
        // just-bash imports node:zlib for its gzip/gunzip/zcat
        // commands (which the agent doesn't need for editing HTML).
        // Stub the import to avoid pulling a polyfill into the bundle.
        { find: "node:zlib", replacement: new URL("./src/lib/zlib-stub.js", import.meta.url).pathname },
      ],
    },
  },
  env: {
    OPENROUTER_API_KEY: {
      label: "openrouter api key",
      prompt: "sk-or-…",
      required: true,
      secret: true,
    },
    // Integrations — optional. Surfaced via the Integrations modal
    // (File menu). Stored in browser localStorage, never written
    // into the .workbook.html (so sharing the file doesn't leak
    // your keys). Each enables the matching skill so the agent
    // can use bash to call the service's HTTPS API.
    FAL_API_KEY: {
      label: "fal.ai api key",
      prompt: "fal_…",
      required: false,
      secret: true,
    },
    ELEVENLABS_API_KEY: {
      label: "elevenlabs api key",
      prompt: "sk_…",
      required: false,
      secret: true,
    },
    RUNWAY_API_KEY: {
      label: "runway api key",
      prompt: "key_…",
      required: false,
      secret: true,
    },
    HUGGINGFACE_TOKEN: {
      label: "huggingface token (optional — gated models / higher limits)",
      prompt: "hf_…",
      required: false,
      secret: true,
    },
  },
};
