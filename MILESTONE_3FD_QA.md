# Milestone 3F-D — Portable Inspector and final integration QA

Branch: `feature/building-inspector-3f`. Build: `0.1-dev.3fd`.
Status: **fully CI-verified release candidate**, PR [#2](https://github.com/xbwtyz/Mappo/pull/2) open for review. No merge or Pages publication.

## Changes

- Save optional property and building selection as `workspace.ui.selection`, retaining city schema 9 and workspace schema 1.
- Validate bounded selection references before restoring, and resolve them only against the loaded accepted city, current layer visibility and building-to-property links.
- Drop stale, hidden or missing selection references safely; preserve old saves that omit a selection.
- Keep independently applied property/building custom names/uses in the accepted city; explicitly keep unapplied identity drafts and bounded identity Undo history session-only.
- Preserve separate geometry tools, undo scopes, deterministic inline HTML build and offline behavior.

## Test coverage

- Added compiled application integration tests for child selection round-trip, missing/hidden references, older optional workspace state and exact accepted geometry.
- Added saved UI schema validation tests and expanded native browser checkpoint checks for portable property Inspector restoration.
- [CI run 44265027575](https://github.com/xbwtyz/Mappo/actions/runs/44265027575) passed **205/205 Node tests** (0 failed), including portable reference and legacy compatibility tests.
- **8/8 standalone smoke** and **8/8 expanded property/building interaction checks** passed in Chromium and Firefox at 1440×900, 5120×1440, 768×1024 and 390×844.
- GitHub Actions verified committed `index.html` equals `dist/mappo-0.1-dev.3fd.html`, and the deterministic build left both files unchanged. Existing build assertions cover inline CSS/JavaScript and no external runtime references.
- The runner archived browser screenshots and the compiled standalone HTML as GitHub Actions artifacts. These are automated checks, not physical-device or screen-reader acceptance.

## Remaining manual acceptance

Automated browser pointer tests and viewport emulation do not replace physical touchscreen, assistive-technology, or exhaustive terrain gesture testing. This checkpoint does not authorize a merge, release tag or GitHub Pages update.
