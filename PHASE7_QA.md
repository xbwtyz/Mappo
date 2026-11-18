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
- [ ] Chromium and Firefox
- [ ] Desktop 1440×900; ultrawide 5120×1440; tablet 768×1024; mobile 390×844
- [ ] Section navigation; menu, selection, inspector, collapse/reopen, map size, focus and horizontal overflow
- [ ] Report any limitations of automated checks versus human visual inspection

## 7D: Release preparation
- [ ] `npm run check`, version synchronization, standalone root/dist byte parity, offline script/style safety
- [ ] Update README, UI architecture notes, compatibility notes and QA report
- [ ] Deliver branch review candidate; **wait for merge approval**

Notes: Static control inventory verifies presence, not functional parity. A virtual browser can measure layouts and exercise interactions; appearance and gesture usability still benefit from manual Firefox and Chrome review.
