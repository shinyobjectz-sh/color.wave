![color.wave](./banner.png)

# color.wave

A portable HTML AI video editor. One file (~800 KB). Runs anywhere.

color.wave is a single-file SPA built on the [workbooks](https://github.com/shinyobjectz-sh/workbooks) framework. An LLM agent edits an HTML video composition; a sandboxed iframe renders it; a parsed timeline shows clips with their `data-start` / `data-duration`. State persists in the file itself — open a `.workbook.html` artifact, edit, save, share.

## Quick start

```bash
git clone --recurse-submodules https://github.com/shinyobjectz-sh/color.wave.git
cd color.wave
bun install
bun run build
# → dist/color.wave.html (open in any browser)
```

## What's in the box

- **Chat-on-left, player-on-right** — Cmd+K-style composer, sandboxed iframe preview
- **Timeline** — auto-parsed clips from `data-start` / `data-duration` attributes
- **Effects** — agent-generated parametric controls (color pickers, sliders, toggles) bound to selectors in the composition. Hot-swap on change; ride along inside the file when you share it.
- **Skills** — markdown reference packs the agent loads on demand (`hyperframes`, `gsap`, `effects`, `hyperframes-cli`)
- **CRDT state** — composition + assets in a single `<wb-doc>` Yjs doc; Cmd+S saves the whole project back into the file
- **Self-decompressing** — the build wraps the inlined runtime in a gzip sandwich (`DecompressionStream` shim) so the on-disk file stays ~800 KB despite shipping the full wasm/JS runtime

## License

Apache-2.0 — see [LICENSE](LICENSE).
