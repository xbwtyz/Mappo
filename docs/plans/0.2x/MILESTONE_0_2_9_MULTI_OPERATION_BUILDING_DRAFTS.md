# Mappo 0.2.9 — C02 Multi-operation Building Drafts

**Issue:** [#105](https://github.com/xbwtyz/Mappo/issues/105). **Baseline:** merged 0.2.8 (`1645ccf`), **target:** `0.2.9-dev`. **Status:** owner-approved architecture and P1–P5 implementation; separate approval still required for merge, release, tag and Pages. **Data:** schema 9, envelope 1.

## Goal and user experience

Previously the direct building editor permits only one topology-changing edit (vertex insertion/removal, attached wing, courtyard addition/removal) before Apply or Reset. C02 allows **up to 16 successful structural edits on one building** in the existing detached draft, with unlimited coordinate adjustments and interleaved move/rotate/resize, followed by a single validated Apply and one scoped Undo/Redo. The existing UI shows a compact `N/16 structural edits` hint and locatable errors.

## Approved D-029 decisions

| ID | Approved A choice |
|---|---|
| D-029-1 | One building per draft transaction, reuse existing selection and stale-revision safety |
| D-029-2 | Maximum 16 successful structural edits; failed/no-op operations do not count; coordinate changes unlimited |
| D-029-3 | Validate local shape at every discrete step; correctable full-project conflicts may persist but block Apply |
| D-029-4 | Deterministically remap vertex, edge and hole selection, clearing invalid/ambiguous references |
| D-029-5 | One accepted history entry per Apply; Reset discards entire draft, no draft-step Undo |
| D-029-6 | Interleave transforms and topology changes without cumulative double-application |
| D-029-7 | Reuse existing Transform/Vertices/Edges/Courtyard controls and show compact pending count |

## Checkpoints and acceptance

### P1 — Baseline and fixtures
- Reproduce second-operation rejection and disabled UI controls; document 0.2.8 baseline.
- Reuse deterministic generated city/wing/courtyard fixtures, accepted-city snapshots and independent negative cases.
- **Gate:** at least one valid two-step positive fixture and non-mutation baseline.

### P2 — Multi-operation draft engine
- Replace single-change lock with bounded count and locally validated detached geometry transitions.
- Fold transformed preview into the draft once and preserve orientation; no duplicate transform logic.
- Reconcile selected ring/handle after insert, delete, wing, courtyard add/remove.
- **Gate:** Node positives for wing→courtyard→vertex insert, a 16-step limit, invalid-step rollback, stale city isolation, transform interleaving.

### P3 — Existing editor UI and browser interaction
- Keep existing workspace; remove topology-only disabled guards.
- Show count and limit hint, maintain focus and numeric/pointer interactions, refresh selection options.
- **Gate:** real Chromium/Firefox desktop browser acceptance for multiple operations, live status, reset and valid Apply.

### P4 — Full-city Apply, atomic history and persistence
- Retain shared `inspectBuildingGeometry`, `prepareBuildingApply`, plot ownership, frontage/access and schema-9 portable round-trip.
- One accepted Apply → one BuildingGeometryHistory record; one Undo/Redo pair restores before/after.
- **Gate:** no accepted data or recovery mutation from invalid drafts/Cancel/Reset/stale revisions; unknown metadata and unrelated records preserved.

### P5 — Compiled artifact, CI and PR
- Keep `package.json` / `APP_VERSION` aligned at `0.2.9-dev`; generate identical `index.html` and `dist/mappo-0.2.9-dev.html`.
- Run targeted tests while developing; full six-runner CI (two Node shards; desktop, roads, property, integration browser suites) and aggregate gate at exact PR head; offline `file://` checks.
- Update roadmap, decision log, Issue #105 and PR with verified evidence, before/after UX, retained limitations.
- **Gate:** all CI green on review-ready head and one focused PR; merge, release and Pages are independently gated.

## Risks, restrictions and reuse

- Array-index shift: map insertion to new vertex, wing to resulting edge, removed courtyard to exterior; never select a removed ring.
- Transforms: consume current transformed world-space preview once and reset transient transform, preserving orientation.
- Temporary property/neighborhood/access conflict: allow further locally valid edits but independently reject invalid Apply.
- No schema 10, separate editor, global history, detached building components, booleans, nested courtyard islands or forced onboarding.
- Reuse `src/editor/building.js`, `src/core/building-footprint-f1.js`, `src/core/building-transform.js`, `src/ui/building-footprint-controls.js`, `src/editor/building-application.js` and `src/editor/building-history.js`.
