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
| Source | `plugins/<id>/` at the repo root |
| Built artifact | GitHub Release asset, tagged `plugin-<id>-v<version>` |

## Publishing a new plugin

1. Add source under `plugins/<id>/` — output must be a single-file ESM bundle exporting `manifest` and `onActivate(wb)`.
2. Build it: `bun run build` in the plugin's dir.
3. Tag a release: `git tag plugin-<id>-v<version> && git push origin plugin-<id>-v<version>`.
4. Attach the built `.js` as a release asset:
   ```
   gh release create plugin-<id>-v<version> dist/<id>.js \
     --title "Plugin: <name> v<version>" --notes "..."
   ```
5. Bump `registry.json` — update `latest.version` and `latest.url` for the entry, or add a new entry.
6. Push to `main`. Every PluginManager refresh sees the change immediately.

## Tag namespaces in this repo

| Pattern | What |
|---|---|
| `v0.1.x` | Editor (color.wave itself) |
| `plugin-<id>-v<version>` | Plugin release asset |

This separation keeps editor and plugin releases visually distinct in the GitHub release feed.

## Schema validation (CI later)

Editing `registry.json` by hand is fine. A future GitHub Action can validate every PR against `registry.schema.json` to catch typos.
