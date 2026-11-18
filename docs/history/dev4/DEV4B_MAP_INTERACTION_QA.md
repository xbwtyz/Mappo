# Mappo Dev 4b — Map Interaction and Responsive Clarity

**Status:** Implemented on feature branch; full CI/owner merge approval pending.  
**Version:** `0.1-dev.4b` · **Branch:** `feature/dev4-map-interaction`  
**Scope:** Four improvements approved in the [Dev 4 roadmap](DEV4_SMALL_IMPROVEMENT_CYCLES_PLAN.md) (the original individual ideas 4b, 4c, 4m, and 4o).

> Branch isolation: work started from stable merged 3I because Dev 4a PR #12 remains separate/unmerged. This development preview does **not** include Dev 4a property deletion. Before merging Dev 4b, merge the separately approved and CI-green Dev 4a, update this branch against that `main` (resolving conflicts and rebuilding the standalone HTML), then rerun all checks on the final 4b head. No stacked PR or automatic merge.

## Checkpoints and acceptance

### 4B-1 — Selection feedback
- [x] Maintain existing visually distinct teal hover and amber selected property/building outlines.
- [x] Add screen-pixel-sized corner accents only to accepted selected parcels/roofs, never hover or stale IDs.
- [x] On selected property with Plots visible, reinforce just its owned plot boundaries in a different teal line; do not repaint or mutate city data.
- [x] Respect the property/building visibility layers and selection ownership.

### 4B-2 — Zoom to selection
- [x] Add **Zoom to this property** and **Zoom to this building** Inspector actions.
- [x] Fit real property boundary or building footprint using the existing camera and zoom limits, with proportional screen padding.
- [x] Preserve selection and city data; on tablet/phone close the Inspector after focus so the map can be seen.

### 4B-3 — Zoom readability
- [x] Clamp high-zoom roof detail and boundary line widths so outlines do not overwhelm small buildings.
- [x] Increase optional parcel/plot layer contrast without changing street geometries, shading, labels or layers.

### 4B-4 — Responsive finishing
- [x] Improve map toolbar touch targets and horizontal overflow on narrow viewports.
- [x] Keep Inspector text wrapping and scroll behavior contained, with more compact phone spacing.
- [x] Preserve existing sidebar behavior, event dispatch, map hit testing and current editing controls.

## QA requirements

- [x] `tests/map-interaction-4b.test.js` covers pure camera focus, no mutation, selection layer rules, selected corner overlays, and compiled Inspector actions.
- [x] `scripts/building-browser-qa.mjs` exercises Zoom to this property on all desktop, ultrawide, tablet and phone viewports in Chromium and Firefox, with camera reset and an unchanged-city assertion.
- [ ] Green GitHub Actions check on exact current branch SHA: `npm run check`, compiled output parity, and both complete Playwright matrices.
- [ ] Owner review and separate approval before merging. Dev 4a must first be merged; update/recompile/retest this branch afterward.

## Release compatibility

Project schema remains **9** and workspace schema **1**. Selected geometry remains non-destructive. No new dependencies are shipped in the standalone distribution.

- Root: [`index.html`](../../../index.html)
- Standalone: [`dist/mappo-0.1-dev.4b.html`](../../../dist/mappo-0.1-dev.4b.html)
