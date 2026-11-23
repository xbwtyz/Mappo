# Mappo Developer Guide

**Published GitHub Release:** [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0) · [Agent instructions](../../AGENTS.md) · [Development rules](development-rules.md) · [Project format](../reference/PROJECT_FORMAT.md)

## Current source organization (v0.2.0)

Mappo's runtime is dependency-free and the accepted 2D city is the single source of truth. The canonical desktop workspaces are **Generation / Add / Roads** with a property-first Inspector. The older four-section shell remains an internal compact/fallback, with domain controllers reused rather than reimplemented.

| Area | Responsibility |
| --- | --- |
| `src/core/` | Models, deterministic geometry/topology, validators and version |
| `src/generators/` | Seeded generation of cities, buildings, water, terrain and fortifications |
| `src/data/` | Schema-9 persistence, supported migrations, safe loading and browser recovery |
| `src/editor/` | Non-destructive drafts/previews, independently validated Apply, scoped histories |
| `src/renderer/` | Canvas layers, camera, selection and editing overlays |
| `src/ui/` | Desktop workspace, Inspector, Project/Layers controls and legacy fallback |
| `src/worker/` | Bundled background computation for junction previews |
| `src/app.js` | Application and accepted-city orchestration |
| `styles/app.css`, `index.template.html` | Styling and HTML template sources |
| `scripts/build.mjs` | Deterministic standalone HTML compilation |
| `tests/`, `scripts/*qa*.mjs` | Node, Firefox and Chromium verification |

**Modify modular source, never compiled HTML directly.** The build embeds modules and CSS into byte-identical `index.html` and `dist/mappo-<APP_VERSION>.html`. Preserve shipped save migrations, historical distributions, protected data and scoped Undo/Redo. Validate targeted changes before full six-runner CI on the review-ready PR.

For an accurate individual-file listing, consult the [architecture atlas](../architecture/Mappo_Repository_Atlas.md). For the modern desktop workspace, consult the [G3G parity review](../history/0.2/workspace/g3g-parity-review.md) and [G4 acceptance](../history/0.2/workspace/g4-acceptance-report.md).

<details>
<summary>Historical 3G–3I implementation notes (retained for original design context)</summary>

Properties are primary selected sites; individual buildings are child records with independent identity. 3G-C extends the transient preview with exact polygon and ownership validation, plot/entrance/access-path reconciliation, and a guarded atomic replacement of the accepted project only after schema-9 saved-project validation and portable round trip. Failed candidates never mutate existing data; after Apply, files.changed() marks the new city for recovery. 3G-D adds a separate, 20-step session-only per-building geometry history. The redo/undo preflight preserves unrelated building identity fields, validates the full candidate and performs a portable document round trip before committing. Rebuild, project load and recovery reset the history; accepted building geometry remains part of schema 9. 3H adds independently validated structural transactions within existing properties, with no new schema fields. Add/replace/delete modify property building membership and building records atomically; structural Undo/Redo history is session-only, reset on load/rebuild. Keep accepted geometry distinct from drafts. Validate restored selections against record existence, parent relationships and layer visibility. 3I adds property-scoped preview and plot reflow, validating convexity, street margins, neighboring property overlap and building containment. Apply reconciles parcel/plot/occupied-plot/open-space facts, checks schema 9 and portable encoding, and commits atomically. Session-only property Undo/Redo is invalidated by accepted building/structural actions and cleared on load/regeneration. Do not reattach identities to potentially reused IDs after regeneration.

</details>

## Build and automated checks

Use **Node.js 20.11 or newer**. Standard build and Node tests do not require `npm install`.

```bash
npm run build
npm test
npm run check
```

The build compares `APP_VERSION` in `src/core/version.js` with `package.json`, embeds locally imported JavaScript and styles, and generates identical files `index.html` and `dist/mappo-<APP_VERSION>.html`. Published v0.2.0 output: `dist/mappo-0.2.0.html`, with `dist/mappo-0.2-dev.g3g.html` and `dist/mappo-0.1.0.html` archived. External runtime imports are rejected. H5 is a version freeze; there is no schema change.

```bash
cmp index.html dist/mappo-0.2.0.html
git diff --exit-code -- index.html dist/mappo-0.2.0.html
```

Use a Windows binary comparison tool if `cmp` is unavailable. Update paths when the release version changes.

Node tests use `node --test tests/*.test.js` and verify geometry, project migrations, editing and simulated compiled-app interactions. GitHub CI splits them into two native Node shards alongside four browser QA suites. Install test-only Playwright 1.56.1 and Chromium/Firefox as described in [current CI](ci-guide.md), then run:

```bash
npm run test:browser               # all browser suites
npm run test:browser:desktop       # modern three-tab + G4 acceptance
npm run test:browser:g4            # focused G4 browser matrix
```

H2 adds complete archived schema 1–8 Node migration checks and native browser open/export/reopen for representative historical files. Run `npm run test:browser:h2` for focused H2 compatibility acceptance. G4's desktop suite records `artifacts/g4/desktop-acceptance.json` and `.md` with browser/viewport, historical-save and offline status, Small/Large draw measurements, and road preview timing. Its separate cross-editor test verifies a real canonical desktop split/merge, wing and courtyard changes, accepted history and portable reopen. These are diagnostics, not guaranteed user-device timings.

The published v0.2.0 merge passed [exact-main CI](https://github.com/xbwtyz/Mappo/actions/runs/44960254289): **459/459 Node tests** and the Chromium/Firefox browser suites. Automated QA does not replace owner-run visual testing.

**Legacy-save compatibility:** v0.2.0 ships migrations for schemas 1–8 and current CI tests that functionality. The owner has switched **mandatory compatibility with every older save OFF for future releases**. This does not authorize deleting current migration code, frozen fixtures or tests. A change to supported versions needs a separately approved schema/format plan, safe rejection, backups and test policy. Preserve `tests/fixtures/` under the [archival policy](../maintenance/BUILD_RETENTION_POLICY.md). See [Project Format](../reference/PROJECT_FORMAT.md) and [Development Rules](development-rules.md).

## Feature and release workflow

1. Discuss and approve a scoped design, then create a feature branch.
2. Update modular source in manageable checkpoints.
3. For a release checkpoint, update the source/package versions together, compile, and commit matching `index.html` and `dist/mappo-<version>.html`.
4. Keep historical distribution files intact unless a separate archival plan is approved.
5. Run Node tests, source-to-compiled parity, compatibility checks for **supported** project formats and relevant browser QA. Do not silently modify historical-test expectations.
6. Present a pull request for explicit approval before merging.

**Release workflow:** [`.github/workflows/release.yml`](../../.github/workflows/release.yml) is a **manual, version-specific publisher for v0.2.0**, which already [published successfully](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0). Its checks include explicit confirmation, stable app/package versions, release notes and asset, exact-main CI, build parity, and refusal to overwrite a tag. A **future version requires a separately approved workflow update and separate release authorization**. Merging a PR never authorizes publication.

**Pages behavior:** [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) is manual-only on `main`. A PR merge does **not** deploy the site. The owner can explicitly run the Pages workflow when ready.

**Unified CI:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) uses two Node shards and four browser suites on review-ready PRs, `main`, merge groups and manual dispatch. The required check is still **Build, Node tests and browser QA**. The heavy C7 performance benchmark is manual opt-in. See the [CI guide](ci-guide.md).

[3G-C milestone QA and acceptance safety](../history/3g/MILESTONE_3GC_QA.md) · [3G-B milestone QA](../history/3g/MILESTONE_3GB_QA.md) · [3G-A milestone QA](../history/3g/MILESTONE_3GA_QA.md) · [Workspace UI reference](../history/ui/workspace-ui.md) · [UI control map](../history/ui/ui-control-map.md) · [Water](../reference/WATER.md) · [Terrain](../reference/TERRAIN.md) · [Districts](../reference/DISTRICTS.md) · [Fortifications](../reference/FORTIFICATIONS.md)
