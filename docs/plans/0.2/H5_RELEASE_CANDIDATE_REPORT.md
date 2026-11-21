# Mappo 0.2H H5 — 0.2.0 Release Candidate Review

**Status:** Release-candidate changes prepared on `feature/mappo-0.2h-h5-release-candidate`, awaiting automated verification and separate owner merge approval. **This document does not authorize publishing.** The latest published GitHub Release remains **v0.1.0** until its manually approved successor actually appears.

## Candidate provenance and version

- Built from the merged H4 main commit `baf25094149e40d2078e2fdc9cc1a34a9ba43689`.
- Application **`APP_VERSION = '0.2.0'`**, package **`0.2.0`**, project schema **9**, portable envelope **1**. **No migration or behavioral feature changes** for H5.
- `index.html` and **`dist/mappo-0.2.0.html`** compiled output must be byte-identical; `dist/mappo-0.2-dev.g3g.html` and published v0.1.0 are preserved without alteration.
- [Release notes](../../releases/v0.2.0.md) identify new streets, property split/merge, building footprints, desktop workspace, recovery/legacy saves, known limitations, and independent publication rules.

## H5 pre-merge acceptance gates

- [x] Source app version and package version set to exactly `0.2.0` without changing project schema.
- [x] Check in the matching standalone distribution and root HTML; preserve older versioned HTML snapshots.
- [x] Add reviewed release notes with upgrade instructions, user-facing feature changes and restrictions.
- [ ] Verify deterministic `npm run build`, identical root/versioned HTML, correct single-file offline runtime, no external imports and zero generated-file drift.
- [ ] All native Node tests and four Chromium/Firefox browser suites pass on **exact PR-head SHA**, including G4 desktop viewports, H2 historical migration and H4 recovery.
- [ ] Preserve all existing manually triggered release and Pages workflows, fixed required CI gate names and no new routine benchmark burden.
- [ ] Record exact CI run, immutable artifact, test counts, supported browsers, outstanding known issue #79 and release-readiness conclusion.
- [ ] Owner provides **separate approval to merge H5 PR**. Merge is not permission to create a release.

## Publication — separate owner authorization required

- [ ] H5 PR merged into main after passing checks and explicit approval.
- [ ] A successful `Mappo CI` push run exists on that **exact final main SHA**; check no extra commits superseded it.
- [ ] Owner explicitly approves publishing **v0.2.0 GitHub Release**, independently of PR merge.
- [ ] Manually dispatch `.github/workflows/release.yml` on `main` with version `0.2.0` and the required confirmation `PUBLISH-0.2.0`. The workflow refuses stale main commits, dev versions, changed output, missing notes, and existing tags/releases. Never rename/move the old v0.1.0 tag.
- [ ] Verify release tag commit, downloadable offline HTML, hash/checks, preserved v0.1.0, and correct release notes.
- [ ] Optional GitHub Pages publication is **another manual, separately approved** step; it does not occur automatically on merge or GitHub Release.

## Remaining scope and user experience

No new H5 editor controls, forced interactions, schema changes or content migration. The only user-visible change relative to merged H4 is the version label `0.2.0`; after publication, the fully tested offline HTML and release notes become an official download. [Issue #79](https://github.com/xbwtyz/Mappo/issues/79) is intentionally deferred. H3's documented brief frame hitches and worker-disabled synchronous fallback remain known limitations, not secretly claimed fixes.
