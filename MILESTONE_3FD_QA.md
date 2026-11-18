# Milestone 3F-D — Portable Inspector and final integration QA

Branch: `feature/building-inspector-3f`. Build: `0.1-dev.3fd`.
Status: implementation committed; GitHub Actions browser matrix is still running.

## Changes

- Save optional property and building selection as `workspace.ui.selection`, retaining city schema 9 and workspace schema 1.
- Validate bounded selection references before restoring, and resolve them only against the loaded accepted city, current layer visibility and building-to-property links.
- Drop stale, hidden or missing selection references safely; preserve old saves that omit a selection.
- Keep independently applied property/building custom names/uses in the accepted city; explicitly keep unapplied identity drafts and bounded identity Undo history session-only.
- Preserve separate geometry tools, undo scopes, deterministic inline HTML build and offline behavior.

## Test coverage

- Added compiled application integration tests for child selection round-trip, missing/hidden references, older optional workspace state and exact accepted geometry.
- Added saved UI schema validation tests and expanded native browser checkpoint checks for portable property Inspector restoration.
- Final CI results and browser viewport matrix are recorded after the validation run completes.

## Remaining manual acceptance

Automated browser pointer tests and viewport emulation do not replace physical touchscreen, assistive-technology, or exhaustive terrain gesture testing. This checkpoint does not authorize a merge, release tag or GitHub Pages update.
