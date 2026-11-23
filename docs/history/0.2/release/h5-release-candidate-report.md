# Mappo 0.2H H5 — 0.2.0 Release Candidate Review

**Status:** 0.2.0 release-candidate [PR #91](https://github.com/xbwtyz/Mappo/pull/91) has passed its first full six-runner CI, [run #44959445766](https://github.com/xbwtyz/Mappo/actions/runs/44959445766), in **2m 45s**. Final documentation-only PR-head revalidation and separate owner merge approval remain pending. **This document does not authorize publishing.** The latest published GitHub Release remains **v0.1.0** until its manually approved successor actually appears.

## Candidate provenance and version

- Built from the merged H4 main commit `baf25094149e40d2078e2fdc9cc1a34a9ba43689`.
- Application **`APP_VERSION = '0.2.0'`**, package **`0.2.0`**, project schema **9**, portable envelope **1**. **No migration or behavioral feature changes** for H5.
- `index.html` and **`dist/mappo-0.2.0.html`** compiled output must be byte-identical; `dist/mappo-0.2-dev.g3g.html` and published v0.1.0 are preserved without alteration.
- [Release notes](../../../releases/v0.2.0.md) identify new streets, property split/merge, building footprints, desktop workspace, recovery/legacy saves, known limitations, and independent publication rules.

## H5 pre-merge acceptance gates

- [x] Source app version and package version set to exactly `0.2.0` without changing project schema.
- [x] Check in the matching standalone distribution and root HTML; preserve older versioned HTML snapshots.
- [x] Add reviewed release notes with upgrade instructions, user-facing feature changes and restrictions.
- [x] `npm run build` regenerated `index.html` and `dist/mappo-0.2.0.html` identically, with **no tracked-file drift** and no external runtime imports. [Compiled CI artifact](https://github.com/xbwtyz/Mappo/actions/runs/44959445766/artifacts/14729240337) contains both matching files.
- [x] All **459/459 Node tests** (228 + 231) and desktop/roads/property/integration Chromium/Firefox suites passed on the H5 implementation SHA `2b0cb5d245aea7c47113c2058e2f0a840cca30b1`; final docs-only SHA to be rechecked.
- [x] Existing manual-only release/Pages workflows and six-runner required CI gate remained unchanged; no new routine benchmark tests added.
- [x] Exact CI run, standalone SHA256, artifact, 459 test counts, Chromium/Firefox desktop coverage, known limitations and initial release-readiness assessment recorded below.
- [ ] Owner provides **separate approval to merge H5 PR**. Merge is not permission to create a release.

## H5 first full-CI result and release assessment

- **First full candidate CI:** [GitHub Actions run #44959445766](https://github.com/xbwtyz/Mappo/actions/runs/44959445766) — **success**, **2m 45s**, all six independent jobs plus combined `Build, Node tests and browser QA` gate green.
- **Native tests:** shard 1 **228/228**, shard 2 **231/231**, total **459/459**. The existing browser desktop, roads, property and integration suites all passed, including G4 supported laptop/desktop/ultrawide viewports, H2 frozen legacy saves, H4 IndexedDB-backed recovery, real `file://` startup and offline/invalid-Apply protection in Chromium and Firefox.
- **Compiled standalone:** Both `index.html` and `dist/mappo-0.2.0.html` were built to exactly **1,651,884 bytes** and verified identical to **committed tracked HTML** without any diff. [Release-candidate artifact](https://github.com/xbwtyz/Mappo/actions/runs/44959445766/artifacts/14729240337). **SHA256:** `48ddba323233de1e2d5798ce3060ab36627f25abfa6d71ac9b29fb8d6aaedcdc`. Git blob `b8e2feb51093afc055d7208e1faed85344d7a6fb`.
- **Other artifacts:** Separate desktop, road, property and integration evidence packages uploaded by the same CI run, five artifacts total.
- **Readiness finding:** The candidate passes all planned H5 code/browser gates and no new release-blocking regression was identified. [Issue #79](https://github.com/xbwtyz/Mappo/issues/79) remains deferred. The H3 residual brief frame hitches and synchronous fallback limitations remain disclosed rather than claimed resolved.
- **Remaining gates:** re-run final CI after documentation evidence update, obtain separate PR merge approval, require green push CI on the exact merged `main` SHA, and obtain a second authorization to publish. **This is not yet a published release.**

## Publication — separate owner authorization required

- [ ] H5 PR merged into main after passing checks and explicit approval.
- [ ] A successful `Mappo CI` push run exists on that **exact final main SHA**; check no extra commits superseded it.
- [ ] Owner explicitly approves publishing **v0.2.0 GitHub Release**, independently of PR merge.
- [ ] Manually dispatch `.github/workflows/release.yml` on `main` with version `0.2.0` and the required confirmation `PUBLISH-0.2.0`. The workflow refuses stale main commits, dev versions, changed output, missing notes, and existing tags/releases. Never rename/move the old v0.1.0 tag.
- [ ] Verify release tag commit, downloadable offline HTML, hash/checks, preserved v0.1.0, and correct release notes.
- [ ] Optional GitHub Pages publication is **another manual, separately approved** step; it does not occur automatically on merge or GitHub Release.

## Remaining scope and user experience

No new H5 editor controls, forced interactions, schema changes or content migration. The only user-visible change relative to merged H4 is the version label `0.2.0`; after publication, the fully tested offline HTML and release notes become an official download. [Issue #79](https://github.com/xbwtyz/Mappo/issues/79) is intentionally deferred. H3's documented brief frame hitches and worker-disabled synchronous fallback remain known limitations, not secretly claimed fixes.
