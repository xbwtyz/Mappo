# Mappo Developer Guide

**Current baseline:** `0.1-dev.3gb` · [Project README](../README.md) · [Docs index](README.md) · [Project format](reference/PROJECT_FORMAT.md)

## Source organization

Mappo's runtime is dependency-free. Write changes in ES modules and CSS; **do not hand-edit generated `index.html` or `dist/` files** in place of source. The build embeds modules and CSS into one portable HTML file.

```text
src/core/          Geometry, shared model, validation and version
src/generators/    City, streets, buildings, districts, water, terrain and defense generation
src/data/          Project persistence, migration, validation and browser recovery
src/editor/        Gesture controllers, drafts and scoped Undo histories
src/editor/building.js  Transient 3G-B building edit session / gestures (not serialized)
src/core/building-transform.js  Pure transform geometry and preview handles
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

Properties are primary selected sites; individual buildings are child records with independent identity. 3G-B extends the temporary editing session with pure footprint transforms and a separate Canvas overlay. The accepted building, its area/entrance/access path, and save envelopes are never mutated by previews. Keep accepted geometry distinct from drafts. Validate restored selections against record existence, parent relationships and layer visibility. Do not reattach identities to potentially reused IDs after regeneration.

## Build and automated checks

Use **Node.js 20.11 or newer**. Standard build and Node tests do not require `npm install`.

```bash
npm run build
npm test
npm run check
```

The build compares `APP_VERSION` in `src/core/version.js` with `package.json`, embeds locally imported JavaScript and styles, and generates identical files `index.html` and `dist/mappo-<APP_VERSION>.html`. Current output: `dist/mappo-0.1-dev.3gb.html`. External runtime imports are rejected.

```bash
cmp index.html dist/mappo-0.1-dev.3gb.html
git diff --exit-code -- index.html dist/mappo-0.1-dev.3gb.html
```

Use a Windows binary comparison tool if `cmp` is unavailable. Update paths when the release version changes.

Node tests use `node --test tests/*.test.js` and verify geometry, project migrations, editor behavior and simulated compiled-app interactions. For graphical browser checks, install test-only Playwright and Chromium/Firefox as described in the [current CI guide](CI.md), then run:

```bash
node scripts/browser-qa.mjs
node scripts/building-browser-qa.mjs
```

The last completed 3F-D development run passed **205/205 Node tests** and **16/16 graphical browser checks** (Chromium/Firefox, desktop/ultrawide/tablet/phone): [CI run](https://github.com/xbwtyz/Mappo/actions/runs/44265027575) · [QA record](history/3f/MILESTONE_3FD_QA.md). This does not replace hands-on testing.

**Never discard `tests/fixtures/`:** older frozen JSON projects are important compatibility tests. Changes to city/workspace schemas need explicit migration/validation and must follow [the persistence contract](reference/PROJECT_FORMAT.md).

## Feature and release workflow

1. Discuss and approve a scoped design, then create a feature branch.
2. Update modular source in manageable checkpoints.
3. For a release checkpoint, update the source/package versions together, compile, and commit matching `index.html` and `dist/mappo-<version>.html`.
4. Keep historical distribution files intact unless a separate archival plan is approved.
5. Run Node tests, source-to-compiled parity, persistence compatibility and relevant graphical browser QA.
6. Present a pull request for explicit approval before merging.

**Pages behavior:** [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) automatically deploys when the generated HTML or `dist/**` changes on `main`. Documentation-only changes do not match its current path filter. Its publication of historical standalone builds is unchanged in this docs-only cleanup.

**Unified CI:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs version-derived build parity, Node regressions, and both real-browser QA suites for active development branches, pull requests, and `main`. See the [CI guide](CI.md) and [Pass B QA report](PASS_B_QA.md). The old phase-specific validation workflows have been retired.

[3G-B milestone QA and preview contract](history/3g/MILESTONE_3GB_QA.md) · [3G-A milestone QA](history/3g/MILESTONE_3GA_QA.md) · [Workspace UI reference](reference/WORKSPACE_UI.md) · [UI control map](reference/UI_CONTROL_MAP.md) · [Water](reference/WATER.md) · [Terrain](reference/TERRAIN.md) · [Districts](reference/DISTRICTS.md) · [Fortifications](reference/FORTIFICATIONS.md)
