# Mappo 0.2.5 — Flexible Property Splitting (B02)

**Status:** Approved architecture D-025-1 through D-025-5; implementation checkpoint branch `feature/mappo-0.2.5-flexible-property-splits`, targeting [Issue #100](https://github.com/xbwtyz/Mappo/issues/100). **Not merged; no stable release, tag or Pages authorization.**

**Baseline:** 0.2.4 main merge `3c1ddab7a58669f956c7319b9b1d1bdf300be826`. **Version:** `0.2.5-dev`. **Project schema:** 9 unchanged.

## Approved decisions

| Decision | Owner-approved contract |
|---|---|
| D-025-1 | Simple convex/concave source polygons with exactly two connected hole-free successors |
| D-025-2 | One freely positioned straight divider with independent frontage and non-frontage exit endpoints |
| D-025-3 | Both children maintain at least 7 units of accepted direct street frontage |
| D-025-4 | Preserve authored plots, buildings, access and unknown fields; fail closed on ambiguous or destructive splits |
| D-025-5 | Reuse E2 Split Property Inspector, schema 9, focused branch and one PR; merge and publication require separate approvals |

## Intended end-user change

**Before:** 0.2.4 permitted authoring pentagon/concave property shapes, but E2 Split Property allowed only one aligned frontage-to-rear fraction in a convex four-corner property.

**After proposed 0.2.5:** A user may split eligible irregular properties (and use an angled divider on a four-corner property) by choosing a frontage location and an exit boundary edge/location, with live geometry and conflict previews. Existing four-corner E2 remains the default mode. No buildings are moved or removed automatically. Valid Apply commits one reversible project transaction.

## Implementation checkpoint contracts

- [ ] **P1 — Geometry.** Reuse `shapeWellFormed`, `shapeContained`, `shapesOverlapInterior`, `segmentCuts` and 0.2.4 polygon limits; construct two connected CCW polygons; prove no cut reentry, boundary overlap or intersecting interiors. Each child must have >=60 area, >=7 direct frontage, <=12 vertices, complete area conservation within 0.02. Positive rectangle, convex polygon, L-shape, angled cases; negative sliver, malformed, reentry and invalid endpoint cases.
- [ ] **P2 — Plot/building reconciliation.** Deterministically clip convex source plots along the divider, conserve each plot and both successor areas, preserve existing ID for continuing left portion (or unchanged right plot), use next collision-free ID only for newly split right fragments. Preserve whole untouched plots with metadata; reject crossing annotated/unknown provenance. Verify unchanged building footprints, courtyards, entrances, access paths, exact memberships and protected ownership transfers.
- [ ] **P3 — Apply/history/schema.** Extend current `PropertySplitSessionE2` and `preparePropertySplitE2` without parallel mutable city or history. Keep frontage-start/left original property ID, allocate right ID, record `straight-polygon` lineage, validate full fresh candidate/portable schema-9 JSON roundtrip, and atomically Apply/Undo/Redo; reject stale or unsupported states without changing accepted city.
- [ ] **P4 — Existing Inspector.** Reuse E2 controls, rendering overlay and pointer events. Expose 4-corner legacy mode by default; offer flexible straight-cut toggle for four-corner polygons, use flexible mode by default for non-four-corner polygons. Compact numeric frontage/exit percent and exit-edge controls, mouse drag handles, reset/cancel, preview statuses and keyboard focus. Desktop Firefox and Chromium QA only; no new workspace, wizard or phone requirements.
- [ ] **P5 — Regression/CI.** Preserve E2/E3/E4 and 0.2.4 fixtures and no-mutation tests. Add focused positive/negative Node and compiled desktop browser tests, build offline `index.html` and byte-identical `dist/mappo-0.2.5-dev.html`, run full current six-suite CI with required aggregate gate on exact PR head. Report totals, issues, fixes, timing, performance if measured, scope limits and user-experience changes.

## Deterministic split contract

The authoritative frontage is property boundary edge `0 -> 1`. The user chooses a strict interior fraction `frontT` and a strict interior exit fraction `exitT` on any other polygon boundary edge. The line segment must not cross or touch any additional source edge; it must yield exactly two valid, nonoverlapping, bounded successors. Left/frontage-start retains the original property ID, name, custom data and previously accepted lineage. Right/frontage-end obtains a new identity, conservative inherited usage and provenance. Both use the same verified road, block and district. All existing physical buildings remain unmodified; only provably safe ownership references may be updated. Unsupported authored plot retiling remains blocked.

Use the current E2 split-by-fraction implementation unchanged for default legacy four-corner properties. The new helper `src/core/property-split-geometry-025.js` covers only the more general straight-cut branch and reuses existing common validators.

## Exclusions

No curved or multi-segment cuts; no properties lacking direct road frontage, easements, cross-block transfers, hole-bearing polygons or multi-frontage roads. No automatic road, terrain, building or neighboring-lot relocation. B03 merges, B04 multi-divider plot editing, B05 road-driven authored parcel adaptation, global persistent Undo/Redo, schema 10, phone QA and forced onboarding remain separate work.

## Final review and approval gates

- Required source and test checks passed, including no-regression fixtures and independent Apply validation.
- Generated offline root/dist bytes identical; standalone browser QA passed in Firefox and Chromium.
- One focused PR against current `main`, with exact-head six-runner CI and aggregate success.
- User experience, technical changes, performance evidence where measured, and unresolved limitations reported.
- **DO NOT MERGE** until separate owner approval. **DO NOT TAG, RELEASE OR DEPLOY PAGES** without separate approval.
