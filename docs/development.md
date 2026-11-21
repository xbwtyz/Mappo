# Mappo Developer Guide

**Currently published GitHub Release:** `0.1.0` · **H5 unmerged release candidate:** `0.2.0` · [Project README](../README.md) · [Docs index](README.md) · [Project format](reference/PROJECT_FORMAT.md)

## Source organization

Mappo's runtime is dependency-free. Write changes in ES modules and CSS; **do not hand-edit generated `index.html` or `dist/` files** in place of source. The build embeds modules and CSS into one portable HTML file.

```text
src/core/          Geometry, shared model, validation and version
src/generators/    City, streets, buildings, districts, water, terrain and defense generation
src/data/          Project persistence, migration, validation and browser recovery
src/editor/        Gesture controllers, drafts and scoped Undo histories
src/editor/building.js  Transient 3G-B building edit session / gestures (not serialized)
src/core/building-transform.js  Pure transform geometry and preview handles
src/core/building-validation.js  Exact polygon/containment/collision checks
src/editor/building-application.js  Reconciliation, complete project checks and atomic candidate preparation
src/editor/building-history.js  Bounded session history, geometry-only Undo/Redo and atomic validation
src/editor/building-structures.js  Property-local footprint presets and validated add/replace/delete transactions
src/editor/building-structure-history.js  Session-only structural Undo/Redo
src/renderer/building-structure-preview.js  Non-destructive structure placement overlay
src/core/property-geometry.js  Convex parcel/plot reflow and local coordinate bounds
src/editor/property-edit.js  Transient property geometry/plot divider session
src/editor/property-application.js  Exact land geometry validation and atomic schema-9 Apply
src/editor/property-history.js  Bounded linked property/plot history
src/renderer/property-edit-preview.js  Editable parcel and plot overlay
src/renderer/      Canvas layers and camera
src/renderer/building-editing.js  Transformed footprint overlay and handles
src/ui/            Controls, Inspector, selection and project-file workflow
src/app.js         Application integration and accepted workspace
styles/app.css     CSS embedded in output
index.template.html   HTML build template
scripts/build.mjs     Deterministic standalone compilation
scripts/browser-qa.mjs, scripts/building-browser-qa.mjs  Native browser testing
tests/            Node regression tests and historical saved-project fixtures
index.html        Generated GitHub Pages entrypoint
dist/             Versioned standalone HTML snapshots
```

Properties are primary selected sites; individual buildings are child records with independent identity. 3G-C extends the transient preview with exact polygon and ownership validation, plot/entrance/access-path reconciliation, and a guarded atomic replacement of the accepted project only after schema-9 saved-project validation and portable round trip. Failed candidates never mutate existing data; after Apply, files.changed() marks the new city for recovery. 3G-D adds a separate, 20-step session-only per-building geometry history. The redo/undo preflight preserves unrelated building identity fields, validates the full candidate and performs a portable document round trip before committing. Rebuild, project load and recovery reset the history; accepted building geometry remains part of schema 9. 3H adds independently validated structural transactions within existing properties, with no new schema fields. Add/replace/delete modify property building membership and building records atomically; structural Undo/Redo history is session-only, reset on load/rebuild. Keep accepted geometry distinct from drafts. Validate restored selections against record existence, parent relationships and layer visibility. 3I adds property-scoped preview and plot reflow, validating convexity, street margins, neighboring property overlap and building containment. Apply reconciles parcel/plot/occupied-plot/open-space facts, checks schema 9 and portable encoding, and commits atomically. Session-only property Undo/Redo is invalidated by accepted building/structural actions and cleared on load/regeneration. Do not reattach identities to potentially reused IDs after regeneration.

## Build and automated checks

Use **Node.js 20.11 or newer**. Standard build and Node tests do not require `npm install`.

```bash
npm run build
npm test
npm run check
```

The build compares `APP_VERSION` in `src/core/version.js` with `package.json`, embeds locally imported JavaScript and styles, and generates identical files `index.html` and `dist/mappo-<APP_VERSION>.html`. H5 reviewed output: `dist/mappo-0.2.0.html` (candidate), with `dist/mappo-0.2-dev.g3g.html` and `dist/mappo-0.1.0.html` archived. External runtime imports are rejected. H5 is a version freeze; there is no schema change.

```bash
cmp index.html dist/mappo-0.2.0.html
git diff --exit-code -- index.html dist/mappo-0.2.0.html
```

Use a Windows binary comparison tool if `cmp` is unavailable. Update paths when the release version changes.

Node tests use `node --test tests/*.test.js` and verify geometry, project migrations, editing and simulated compiled-app interactions. GitHub CI splits them into two native Node shards alongside four browser QA suites. Install test-only Playwright 1.56.1 and Chromium/Firefox as described in [current CI](CI.md), then run:

```bash
npm run test:browser               # all browser suites
npm run test:browser:desktop       # modern three-tab + G4 acceptance
npm run test:browser:g4            # focused G4 browser matrix
```

H2 adds complete archived schema 1–8 Node migration checks and native browser open/export/reopen for representative historical files. Run `npm run test:browser:h2` for focused H2 compatibility acceptance. G4's desktop suite records `artifacts/g4/desktop-acceptance.json` and `.md` with browser/viewport, historical-save and offline status, Small/Large draw measurements, and road preview timing. Its separate cross-editor test verifies a real canonical desktop split/merge, wing and courtyard changes, accepted history and portable reopen. These are diagnostics, not guaranteed user-device timings.

Dev 4f passed the complete Node, compilation and Chromium/Firefox browser matrices: [CI run #341](https://github.com/xbwtyz/Mappo/actions/runs/44428124074). The 0.1.0 release candidate must pass equivalent CI on its own commit; this does not replace hands-on testing.

**Never discard `tests/fixtures/`:** older frozen JSON projects are important compatibility tests. Changes to city/workspace schemas need explicit migration/validation and must follow [the persistence contract](reference/PROJECT_FORMAT.md).

## Feature and release workflow

1. Discuss and approve a scoped design, then create a feature branch.
2. Update modular source in manageable checkpoints.
3. For a release checkpoint, update the source/package versions together, compile, and commit matching `index.html` and `dist/mappo-<version>.html`.
4. Keep historical distribution files intact unless a separate archival plan is approved.
5. Run Node tests, source-to-compiled parity, persistence compatibility and relevant graphical browser QA.
6. Present a pull request for explicit approval before merging.

**Release workflow:** [`.github/workflows/release.yml`](../.github/workflows/release.yml) is manual-only on `main`, with an explicit 0.2.0 confirmation and guards for exactly matching stable versions, approved release notes, passing main CI on the exact commit, full Node/build parity, immutable release tags and no overwriting v0.1.0. It cannot publish the current development build. The actual 0.2.0 version change, release notes, approval and dispatch belong to H5.

**Pages behavior:** [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) is manual-only on `main`. A PR merge does **not** deploy the site. The owner can explicitly run the Pages workflow when ready.

**Unified CI:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) uses two Node shards and four browser suites on review-ready PRs, `main`, merge groups and manual dispatch. The required check is still **Build, Node tests and browser QA**. The heavy C7 performance benchmark is manual opt-in. See the [CI guide](CI.md).

[3G-C milestone QA and acceptance safety](history/3g/MILESTONE_3GC_QA.md) · [3G-B milestone QA](history/3g/MILESTONE_3GB_QA.md) · [3G-A milestone QA](history/3g/MILESTONE_3GA_QA.md) · [Workspace UI reference](reference/WORKSPACE_UI.md) · [UI control map](reference/UI_CONTROL_MAP.md) · [Water](reference/WATER.md) · [Terrain](reference/TERRAIN.md) · [Districts](reference/DISTRICTS.md) · [Fortifications](reference/FORTIFICATIONS.md)
