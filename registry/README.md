# color.wave plugin registry

Catalog of plugins the color.wave Plugin Manager auto-subscribes to.

| File | Purpose |
|---|---|
| [`registry.json`](./registry.json) | The catalog. Each entry has id, name, description, surfaces, permissions, and a `latest.url` pointing at the plugin's release asset. |
| [`registry.schema.json`](./registry.schema.json) | JSON Schema (draft-07) validating the catalog shape. |

## How it's used

When a user opens the Plugin Manager, the **Browse** tab fetches `registry.json` from `main` (CORS-enabled via raw.githubusercontent.com) and lists every plugin. One click → fetch the asset, embed bytes inline, activate. The bytes run from the embedded copy at runtime — no network needed once installed.

## Where plugins live

| Surface | Location |
|---|---|
| Catalog entry | `registry/registry.json` (this dir) |
| Built artifact (served to browsers) | `registry/assets/<id>-v<version>.js` — checked in, served via `raw.githubusercontent.com` (CORS-clean) |
| Source | `plugins/<id>/` at the repo root |
| Release tag | GitHub Release tagged `plugin-<id>-v<version>` — used as a changelog anchor only, NOT the asset host |

> **Why not GitHub Release assets?** Browser CORS. Release assets redirect to Azure Blob storage which doesn't send `access-control-allow-origin`, so the Plugin Manager's `fetch()` would fail. `raw.githubusercontent.com` always sends `*` for public repos. We keep the GitHub Release tag for human-friendly changelogs, but the JS itself is committed to `registry/assets/` and served from there.

## Publishing a new plugin

1. Add source under `plugins/<id>/` — output must be a single-file ESM bundle exporting `manifest` and `onActivate(wb)`.
2. Build it: `bun run build` in the plugin's dir.
3. Copy the built artifact into the registry: `cp plugins/<id>/dist/<id>.js registry/assets/<id>-v<version>.js`.
4. (Optional, recommended) Tag + draft a release for changelog discoverability:
   ```
   git tag plugin-<id>-v<version>
   git push origin plugin-<id>-v<version>
   gh release create plugin-<id>-v<version> --notes "..."
   ```
5. Bump `registry.json` — update `latest.version` + `latest.url` (point at `raw.githubusercontent.com/.../registry/assets/<id>-v<version>.js`).
6. Push to `main`. Every PluginManager refresh sees the change immediately.

Old versions stay reachable as long as their `<id>-v<version>.js` file remains in `registry/assets/` — useful for plugins that pin a specific version, and trivial to clean up later if a directory ever gets too big.

## Tag namespaces in this repo

| Pattern | What |
|---|---|
| `v0.1.x` | Editor (color.wave itself) |
| `plugin-<id>-v<version>` | Plugin release asset |

This separation keeps editor and plugin releases visually distinct in the GitHub release feed.

## Schema validation (CI later)

Editing `registry.json` by hand is fine. A future GitHub Action can validate every PR against `registry.schema.json` to catch typos.
