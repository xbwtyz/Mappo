# Mappo 0.2H H4 — Final integrated desktop release QA

**Status:** H4 final QA completed and [PR #90](https://github.com/xbwtyz/Mappo/pull/90) merged into `main` after [final CI #44958430396](https://github.com/xbwtyz/Mappo/actions/runs/44958430396) (459 Node tests, all six suites, required aggregate gate, 2m 56s), with separate owner approval. Current application baseline: `0.2-dev.g3g`, project schema **9**, portable file format **1**. H4 is *not* a stable 0.2.0 release, version bump, migration, runtime feature, or public-site publication.

## Release-support scope

- **Supported for 0.2.0:** Chromium and Firefox desktop/laptop at 1366×768, 1440×900 and ultrawide 5120×1440 (G4 matrix); mouse, trackpad wheel and keyboard; offline single HTML file.
- **Accepted editing behavior:** Generation/Add/Roads and canonical Inspector, geometry-preserving road/property/building drafts, atomic Apply, required conflict choices, scoped Undo/Redo, and file downloads/recovery. No forced tutorials, mandatory onboarding or online service.
- **Portable files:** Supported historical project schemas **1–8** migrate to schema **9** without regenerating authored geometry; current schema-9 documents preserve unknown extensions and names. Unsupported future formats fail safely, without replacing the open city.
- **Known limitations:** [#79](https://github.com/xbwtyz/Mappo/issues/79) — deleting a road cannot create a connected dead end; separate future engine work. [H3 audit](H3_PERFORMANCE_AUDIT.md) — occasional approximately 100–183 ms main-thread frame hitches on Large Organic road previews (not the original one-second freeze); worker-disabled fallback and some ordinary road Apply paths may be synchronous. Phone/touch acceptance, civic-site additions and 3D are outside 0.2.0.
- **Release mechanics:** Stable v0.1.0 stays published. The eventual 0.2.0 tag/assets and optional Pages deployment require independent owner approval in H5. H4 cannot publish any release.

## Full acceptance matrix

| Area | Existing / H4 source | Required result |
| --- | --- | --- |
| Reproducible offline standalone | `npm run check`, `scripts/build.mjs`, CI byte parity | No external runtime imports; `index.html` is byte-identical to `dist/mappo-0.2-dev.g3g.html` and no tracked build drift |
| Current schema and frozen historical saves | `tests/persistence.test.js`, `tests/h2-historical-compat.test.js`, `scripts/h2-save-compatibility-browser-qa.mjs` | Schema 1–8 and 9 migrate/round-trip with unchanged IDs/geometry; invalid/future files fail closed |
| User-facing desktop shell | `scripts/g4-desktop-acceptance-browser-qa.mjs` | Chrome/Firefox 1366/1440/5120 widths, keyboard/mouse zoom/pan, real offline `file://` startup |
| Road editing and accepted/draft isolation | `scripts/road-browser-qa.mjs`, `scripts/c7-p2-browser-qa.mjs`, `scripts/c7-p3-offline-qa.mjs`, G4 | Conflict and invalid Apply fail safely; draft cancellation/stale revisions, independently validated Apply and Undo/Redo |
| Properties and buildings | `scripts/property-*-browser-qa.mjs`, `scripts/building-*-browser-qa.mjs`, `scripts/g4-cross-editor-browser-qa.mjs` | Property create/split/merge/plot count, footprint wings/courtyards, linked geometry, uses/identities, history and portable round-trip |
| Browser recovery after reload | **New** `scripts/h4-recovery-browser-qa.mjs` | Native Project-menu imports A/B, IndexedDB current/backup snapshots, no implicit restore, explicit latest and previous restore, authored city/identity preserved, portable export and reopen |
| General integration and QA | `scripts/browser-qa.mjs`, `scripts/d4-browser-acceptance.mjs`, `scripts/building-performance-f4.mjs` | Layers, districts, defenses, landscape, exports, error guidance, desktop regressions |
| Release safeguards and known issues | `tests/h1-release-policy.test.js`, H3 measurements, [#79](https://github.com/xbwtyz/Mappo/issues/79) | Release and Pages remain manual-only, version check fails on development version, documented limitations |

## Verified CI and evidence

- [H4 first full six-runner CI, run #44958095092](https://github.com/xbwtyz/Mappo/actions/runs/44958095092) **passed in 2m 56s**. Both native Node shards, browser desktop, roads, property, integration and combined required `Build, Node tests and browser QA` gate passed.
- Native Node regression: **228/228 in shard 1 + 231/231 in shard 2 = 459/459** tests.
- [Desktop browser QA evidence artifact](https://github.com/xbwtyz/Mappo/actions/runs/44958095092/artifacts/14728402047) contains `artifacts/h4/recovery-acceptance.json`: **Chromium PASS**, **Firefox PASS**, with latest/previous snapshot restores, no silent acceptance, portable export/reopen and zero external HTTP requests.
- [Compiled standalone artifact](https://github.com/xbwtyz/Mappo/actions/runs/44958095092/artifacts/14728128753) contains the unchanged `index.html` and `dist/mappo-0.2-dev.g3g.html` verified by the Node build/parity checks; separate road/property/integration QA artifacts also uploaded (five artifacts total).
- The unchanged existing G4/H2 browser suite passed inside desktop QA: real `file://` startup, all 3 supported desktop widths, road/property/building integrated Apply/Undo/Redo and native archived save migration. Other suites covered roads, property editing, integration and performance smoke checks.
- No product runtime or schema changes and no manual release or Pages workflow was triggered. No additional versioned HTML artifact was required.

**H4 release-readiness assessment:** No H4 test failures or release-blocking regressions are currently identified. The only open issue is [#79](https://github.com/xbwtyz/Mappo/issues/79) (connected dead-end deletion), explicitly deferred beyond 0.2.0. The [H3 limitations](H3_PERFORMANCE_AUDIT.md) are recorded as known behaviors and **not** 0.2.0 blockers by owner decision. The application still needs H5's stable-version bump, approved release notes and separate publication approval.

## H4 completion gates

- [x] All Node tests and six full-CI jobs + required aggregate check pass on the H4 implementation commit (final docs-only commit to be rechecked).
- [x] Browser recovery test passes in Chromium and Firefox; diagnostic `artifacts/h4/recovery-acceptance.json` uploaded.
- [x] G4/H2 offline, history, migration and desktop matrix remain green.
- [x] CI uploads compiled standalone HTML and four browser QA artifacts; no production code changes or runtime network requirements.
- [x] Known #44/#46 closures reflected accurately without claiming zero remaining frame hitches.
- [x] #79 clearly listed as a 0.2.0 known limitation; no unsupported features implied.
- [x] Exact CI run and final release-readiness assessment added here.
- [x] H4 PR #90 received separate owner merge approval; H5 merge and actual release publication each require their own explicit authorization.

## User experience since H3

No new controls, editing semantics, schema migration or forced interactions. H4 exists to confirm that the integrated desktop editor, backup/recovery, offline HTML and older cities work together before stable release. New tests and documentation reduce the risk of losing existing authored work.
