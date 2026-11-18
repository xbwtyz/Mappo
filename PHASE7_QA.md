# Mappo UI Phase 7 — integration and release checklist

Branch: `feature/ui-phase-7`; **do not merge into main or publish Pages without approval**.
Baseline: `0.1-dev.ui6d`, city schema 9, optional workspace UI state in workspace schema 1.

## 7A: Feature audit
- [x] Compare the interactive static controls in the last pre-overhaul distribution (3E.6) with the current template: 93 of 93 retained.
- [ ] Confirm expected controller behavior for each item using integration tests and manual review.
- [ ] Audit drawing, generation, local update, layer, project, and recovery paths.

## 7B: Functional and persistence regressions
- [x] Navigation/selection/scroll and panel state (7B 166/166 regressions)
- [x] Tool routing, independent undo histories, pending updates (7B 166/166 regressions)
- [x] Schema-9 exact-geometry project save/load/recovery and older-file migration (7B 166/166 regressions)
- [x] Geometry, water (rivers/coasts/lakes), terrain, districts and defenses (7B full Node suite)

## 7C: Native browser and viewport QA
- [x] Chromium and Firefox (both browser engines in Phase 7C CI)
- [x] Desktop 1440×900; ultrawide 5120×1440; tablet 768×1024; mobile 390×844 (8/8 smoke checks)
- [x] Section navigation, menus/Escape, inspector collapse/reopen, tools toggle, map sizing, creation forms and horizontal overflow (8/8 scripted smoke checks)
- [x] Document scripted versus manual QA scope; archive and inspect screenshot matrix

## 7D: Release preparation
- [ ] `npm run check`, version synchronization, standalone root/dist byte parity, offline script/style safety
- [x] Update README, UI architecture notes, control inventory, compatibility notes and QA report
- [ ] Deliver branch review candidate; **wait for merge approval**

Notes: Static control inventory verifies presence, not functional parity. A virtual browser can measure layouts and exercise interactions; appearance and gesture usability still benefit from manual Firefox and Chrome review.

## Verified CI evidence and scope

- Phase 7A: [163/163 tests, exact offline distribution parity](https://github.com/xbwtyz/Mappo/actions/runs/44236130079).
- Phase 7B: [166/166 tests, portable schema-9 round trips and scoped history](https://github.com/xbwtyz/Mappo/actions/runs/44236853696).
- Phase 7C: [167/167 Node tests and 8/8 real-browser viewport checks](https://github.com/xbwtyz/Mappo/actions/runs/44238779274).
- Phase 7D: current release candidate; final CI result must be inspected before merge approval.

The 7C browser checks found the map toolbar blocking narrow overlay headers. `styles/app.css` now isolates the map stacking context below the drawer layers, and Chromium/Firefox checks pass. The screenshots were inspected for desktop, mobile and tablet layout. The app remains functional as one offline HTML file; Playwright is installed by CI only and is not imported by the published HTML.

**Remaining human acceptance checks:** individually drag/edit all shoreline and mountain handles, bridges and passes; review accessibility on physical touch devices; inspect uncommon ultra-narrow/zoomed browser configurations; test operating-system download permissions. These are not claimed to be covered by the eight browser smoke paths. The branch can be reviewed without changing the published `main` build.
