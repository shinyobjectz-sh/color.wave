# Releasing color.wave

Standard for cuts, version numbers, and release notes. Read this before publishing a release.

## When to cut a release

Cut a release when at least one of these is true:

- A user-visible feature lands.
- A user-visible bug is fixed.
- A breaking change ships, no matter how small.
- The bundle changes size meaningfully (>5% in either direction).

Don't cut a release for:

- Pure internal refactors with no behavior change.
- Dependency bumps with no behavior change.
- Dev-loop, CI, or tooling fixes.
- Documentation-only changes.

If you find yourself writing a one-line note that doesn't say *what changed for the user*, you probably don't need a release.

## Version numbers

color.wave follows [SemVer](https://semver.org/) with these conventions:

- **Major (`v1.0.0`)** — reserved for the first stable release. The file format and runtime contract are stable; existing files keep working across minor versions.
- **Minor (`v0.X.0`)** — new features, breaking changes to the file format or the agent tool surface. Existing files may need to be re-saved or exported. Always called out as `(breaking)` in the release title when it breaks.
- **Patch (`v0.X.Y`)** — bug fixes, performance work, and small additions that don't change the file format or any public API surface.

## Release notes

Every release note is written for a user, not a contributor. The body explains what changed in their experience, not what changed in the source.

### Voice

- Sentence case. End full sentences with periods.
- Lead with impact. The first sentence should make sense to someone who has never seen the source.
- No emoji. The product is monochromatic; release notes match.
- No "Includes everything from vX.Y.Z." Changelogs are cumulative.
- No `## Download` block. GitHub and colorwave.ai surface the asset.
- Backtick code, file names, keyboard shortcuts, identifiers.
- Markdown links, never bare URLs.

### Structure

**Short releases** (1–2 changes): flat prose. One lead sentence, optional follow-up paragraph or short bullet list.

**Larger releases**: bulleted groups with bold headings, in this order. Skip a heading if it's empty.

```
**Breaking** — anything users have to act on (top of the body)
**New** — added behavior
**Improved** — changes to existing behavior
**Fixed** — bug fixes
```

### Title format

| Kind   | Format                                                  |
|--------|---------------------------------------------------------|
| App    | `vX.Y.Z — short summary`                                |
| Bare   | `vX.Y.Z` (only if the version itself tells the story)   |

Drop any `color.wave ` prefix. The repo and the app already say what this is.

### Breaking changes

Every breaking release names the break in the title (`(breaking)`) and **opens** the body with a single line that tells the user exactly what they have to do:

> **Breaking.** Existing v0.1.x files boot to a fresh starter. Export important work as Hyperframe HTML before upgrading.

### What does not belong in a release note

- Internal build flags or compiler details, unless they explain a user-visible delta (size change, fixed bug behavior).
- Internal task IDs, branch names, PR numbers.
- "Test artifact for…" framing. If a release exists only to test infrastructure, mark it as a draft on GitHub and don't publish it.
- Apologies, jokes, or hedging.

## Process

1. **Bump version.** Update `version` in `package.json`. Pick the right level (patch / minor / major) per the rules above.
2. **Update fallback.** Update the static fallback badge in `apps/colorwave-site/src/index.html` (currently `v0.3.0 · 800 KB`) so the site degrades gracefully if the GitHub API is unreachable.
3. **Build.** `bun run build`. Open `dist/color.wave.html` from disk and smoke-test the golden path before tagging.
4. **Write the body.** Save it to `/tmp/release-vX.Y.Z.md`. Match the voice in v0.3.0 (large release) or v0.1.11 (small fix).
5. **Tag and publish.**
   ```bash
   gh release create vX.Y.Z dist/color.wave.html \
     --title "vX.Y.Z — short summary" \
     --notes-file /tmp/release-vX.Y.Z.md
   ```
6. **Asset name.** The asset must be named exactly `color.wave.html`. The "Download" link on colorwave.ai resolves through `releases/latest/download/color.wave.html`.
7. **Refresh the hosted demo.** `cd apps/colorwave-site && bun run deploy`. The site's build script downloads the `latest` GitHub release asset and serves it at `colorwave.ai/app/`. Without a redeploy, the demo stays pinned to the previous release.
8. **Verify.** Within ~60s, confirm colorwave.ai's download badge shows the new version and size, the new entry shows up at the top of the changelog, and `colorwave.ai/app/` loads the new build.

## Consolidating a noisy patch series

During pre-1.0 iteration it's easy to accumulate a long tail of patch releases that nobody downloaded. When a series has clearly closed (a minor version bumps), consolidate.

- Pick the latest tag in the closing series (e.g. `v0.1.14`) as the survivor.
- Rewrite its body to summarize the *series*, not just the last patch — lead with what landed across the whole minor, group highlights, list notable fixes.
- Retitle it to span the line: `v0.X — short summary` (the tag stays `v0.X.Y`).
- Delete the intermediate GitHub releases. The git tags stay; only the public release pages and old assets go away.

Don't consolidate releases that real users have downloaded or linked to — broken download URLs are worse than a long changelog.

## Examples

The cleaned-up notes from `v0.1.0` → `v0.3.0` are the canonical examples. When in doubt:

- Match **v0.3.0** for substantial releases.
- Match **v0.1.11** for single-fix releases.
- Match **v0.2.0** for breaking changes.
