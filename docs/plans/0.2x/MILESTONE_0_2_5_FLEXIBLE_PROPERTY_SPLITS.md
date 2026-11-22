# Mappo 0.2.5 — Flexible Property Splitting (B02)

**Status:** Owner-approved D-025-1–5 and implementation checkpoints P1–P5 completed on [PR #115](https://github.com/xbwtyz/Mappo/pull/115). Full automated CI succeeded on implementation head `9cd63af29b4aedaba3774510d5559df42b1a3d30`; final documentation/QA revision requires exact-head CI before merge review. **PR OPEN, NOT MERGED; no stable release, tag or Pages authorization.**

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

- [x] **P1 — Geometry.** Reuse `shapeWellFormed`, `shapeContained`, `shapesOverlapInterior`, `segmentCuts` and 0.2.4 polygon limits; construct two connected CCW polygons; prove no cut reentry, boundary overlap or intersecting interiors. Each child must have >=60 area, >=7 direct frontage, <=12 vertices, complete area conservation within 0.02. Positive rectangle, convex polygon, L-shape, angled cases; negative sliver, malformed, reentry and invalid endpoint cases.
- [x] **P2 — Plot/building reconciliation.** Deterministically clip convex source plots along the divider, conserve each plot and both successor areas, preserve existing ID for continuing left portion (or unchanged right plot), use next collision-free ID only for newly split right fragments. Preserve whole untouched plots with metadata; reject crossing annotated/unknown provenance. Verify unchanged building footprints, courtyards, entrances, access paths, exact memberships and protected ownership transfers.
- [x] **P3 — Apply/history/schema.** Extend current `PropertySplitSessionE2` and `preparePropertySplitE2` without parallel mutable city or history. Keep frontage-start/left original property ID, allocate right ID, record `straight-polygon` lineage, validate full fresh candidate/portable schema-9 JSON roundtrip, and atomically Apply/Undo/Redo; reject stale or unsupported states without changing accepted city.
- [x] **P4 — Existing Inspector.** Reuse E2 controls, rendering overlay and pointer events. Expose 4-corner legacy mode by default; offer flexible straight-cut toggle for four-corner polygons, use flexible mode by default for non-four-corner polygons. Compact numeric frontage/exit percent and exit-edge controls, mouse drag handles, reset/cancel, preview statuses and keyboard focus. Desktop Firefox and Chromium QA only; no new workspace, wizard or phone requirements.
- [x] **P5 — Regression/CI.** Preserve E2/E3/E4 and 0.2.4 fixtures and no-mutation tests. Add focused positive/negative Node and compiled desktop browser tests, build offline `index.html` and byte-identical `dist/mappo-0.2.5-dev.html`, run full current six-suite CI with required aggregate gate on exact PR head. Report totals, issues, fixes, timing, performance if measured, scope limits and user-experience changes.

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

## Implemented change map and end-user experience

| Before 0.2.5 | After 0.2.5 development PR |
|---|---|
| E2 accepted only convex quadrilateral frontage/rear fractions | Same legacy mode retained by default; optional flexible straight mode on quadrilaterals and default on other valid 3–12 vertex polygons |
| Cut exit fixed to the matching rear percentage | Independent selectable non-frontage exit edge and numeric fractional position, plus frontage percentage |
| Cannot split accepted convex/concave irregular lots | Two connected, hole-free property successors when segment lies within source and both have >=7 direct accepted-road frontage and >=60 area |
| E2 strip plots only | Deterministic convex plot clipping, unchanged whole-plot ID retention, left-fragment ID continuity and new right-fragment allocation |
| E2 ownership and reversible transactions | Same protections, independent project validation, save/restore and one scoped Undo/Redo transaction extend to flexible mode |
| E2 browser QA | New B02 negative geometry, authored metadata, generated-city and Firefox/Chromium browser QA |

This deliberately introduces no new workspace, no forced setup, no road or building relocation, no internal lot access, and no schema migration.

**Technical implementation:** New pure `src/core/property-split-geometry-025.js` performs straight-cut construction and clipping using existing `shapeWellFormed`, `shapeContained`, `shapesOverlapInterior`, `segmentCuts`, `polygonSignedArea` and 0.2.4 polygon vertex limits. The new geometry path is selected inside existing E2 session/inspection/Apply modules; four-corner E2 remains intact. The existing E1 structural-history alias and fresh portable-schema validator gate remain unchanged. UI controls are added to the existing Property Inspector; the renderer and map pointer delegation reuse existing E2 code. The offline version is `0.2.5-dev`, still schema 9.

## Recorded acceptance evidence — prior exact implementation head

**Mappo CI:** [#44991308763](https://github.com/xbwtyz/Mappo/actions/runs/44991308763) **SUCCESS** on `9cd63af29b4aedaba3774510d5559df42b1a3d30`, start 2026-11-22 05:53:15 UTC, end 05:56:32 UTC, **3m17s**. Both Node shards **230/230** and **273/273**, total **503/503**, **zero failures**, plus all four desktop Firefox/Chromium browser suites and the aggregate `Build, Node tests and browser QA` gate. [Fast Checks #44991249116](https://github.com/xbwtyz/Mappo/actions/runs/44991249116) **SUCCESS** with `npm run build` proving checked-in `index.html` and `dist/mappo-0.2.5-dev.html` unchanged and byte-identical to the source build.

**Focused positive cases:** Angle-adjustable quadrilateral divider with convex plot clipping, connected concave L-shape split and area conservation, generated organic irregular property split with independently validated schema-9 Apply, exact pre-Apply isolation, Undo/Redo/save roundtrip. Existing E2/E3/E4 workflows retained.

**Focused negative cases:** Divider exiting and reentering a concavity, invalid edge/endpoint, too-small frontage/area, unsupported topology and crossing annotated plot. Protect unknown/authored plot fields and prevent failed Apply from changing the accepted city. Full suite and existing browser QA exercise other editors and archived fixture behavior.

**New browser outcomes:** `PASS 025 chromium irregular split/blocked draft/Apply/Undo/Redo/save`; `PASS 025 firefox irregular split/blocked draft/Apply/Undo/Redo/save`, checked with the compiled offline HTML. A follow-up browser assertion for dragging and canceling both endpoint handles was added after this first green run and **must pass on the final revision**.

**Timing/performance qualification:** No new independent generation or interaction latency benchmarks were performed. No claim of speedup or measured regression. The heavy C7 performance benchmark remains opt-in.

**Resolved development issues:** First source-only push failed Fast Checks because `dist/mappo-0.2.5-dev.html` was not yet tracked. Compiled root and dist from the official modular build graph were then committed, and next exact-head Fast Checks and full CI passed. This was a build-artifact synchronization gate, not a production-geometry regression.

## Remaining deliberate scope boundaries

- Only **one straight segment** per Apply; no curves, L-shaped/polyline cuts, multiple divider batching or arbitrary plot authoring (B04).
- Both children must have direct frontage on the same verified road; no easements, internal property access, multiple independent frontage roads, or cross-block transfers.
- No building moves, resizes, slicing, demolition, road edits or automatic city regeneration.
- A source with 3–12 vertices is eligible for inspection, but only configurations producing two <=12-vertex valid properties may Apply. On concave shapes, a straight segment that leaves/reenters source must be rejected even when endpoints lie on its boundary.
- Protected or unknown annotated plots requiring splitting still fail closed rather than inventing metadata semantics; stable whole-plot metadata is preserved.
- Geometry with holes, general B03 merging, B05 road-driven authored parcel relocation, schema 10, mobile QA and persistent global history are separate milestones.
- The reviewed implementation extends 2D single-file offline editing; no mandatory tutorial or competitor references were introduced.

## Final delivery gate

The exact last PR head (including this acceptance document and the enhanced endpoint-handle browser test) must pass the full six-runner CI and aggregate gate. Record final SHA and run in the PR review description. **Merge requires a separate explicit owner approval**, even after green CI; tagging, stable release and Pages deployment are each separate authorizations.
