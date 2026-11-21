# Mappo 0.2H H4 — Final integrated desktop release QA

**Status:** H4 implementation on a separate PR; full CI evidence pending. Current application baseline: `0.2-dev.g3g`, project schema **9**, portable file format **1**. H4 is *not* a stable 0.2.0 release, version bump, migration, runtime feature, or public-site publication.

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

## H4 completion gates

- [ ] All Node tests and six full-CI jobs + required aggregate check pass on the exact H4 PR head.
- [ ] Browser recovery test passes in Chromium and Firefox; diagnostic `artifacts/h4/recovery-acceptance.json` uploaded.
- [ ] G4/H2 offline, history, migration and desktop matrix remain green.
- [ ] CI uploads compiled standalone HTML and four browser QA artifacts; no production code changes or runtime network requirements.
- [x] Known #44/#46 closures reflected accurately without claiming zero remaining frame hitches.
- [x] #79 clearly listed as a 0.2.0 known limitation; no unsupported features implied.
- [ ] Exact CI run and final release-readiness assessment added here.
- [ ] Separate owner review and approval required to merge H4; H5 still needs separate explicit authorization.

## User experience since H3

No new controls, editing semantics, schema migration or forced interactions. H4 exists to confirm that the integrated desktop editor, backup/recovery, offline HTML and older cities work together before stable release. New tests and documentation reduce the risk of losing existing authored work.
