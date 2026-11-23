# Mappo 0.2 — 2D City Designer roadmap

> **Published:** 0.2A–G and H1–H5 are complete. [H5 PR #91](https://github.com/xbwtyz/Mappo/pull/91) was merged, [main CI](https://github.com/xbwtyz/Mappo/actions/runs/44960254289) passed, and [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0) was published. Civic sites and 3D remain deferred.>
> Primary objective: a dependable, fully editable **2D** city designer before 3D. Users deliberately reshape roads; generated neighborhoods adapt where verifiably safe; then users fine-tune land and buildings.

[0.2E property plan](properties/milestone-0-2e-property-design.md) · [E2 straight-split design](properties/e2-property-split-design.md) · [E3 approved merge design](properties/e3-property-merge-design.md) · [E4 approved plot-count design](properties/e4-plot-count-design.md) · [E4 acceptance report](properties/e4-acceptance-report.md) · [E5 approved acceptance plan](properties/e5-integrated-acceptance-plan.md) · [E5 acceptance report](properties/e5-acceptance-report.md) · [E3 acceptance report](properties/e3-acceptance-report.md) · [0.2F building plan](buildings/milestone-0-2f-building-design.md) · [0.2G desktop workspace plan](workspace/milestone-0-2g-desktop-ui.md) · [G1–G4 implementation](workspace/g1-g4-implementation-plan.md) · [0.2G mockups](workspace/assets/Mappo_0.2G_UI_Mockups.pdf) · [0.2H release plan](release/milestone-0-2h-release-plan.md) · [H3 performance results](release/h3-performance-audit.md) · [H4 final QA report](release/h4-release-qa-report.md) · [H5 release-candidate report](release/h5-release-candidate-report.md) · [G4 acceptance report](workspace/g4-acceptance-report.md) · [0.2D closeout](roads/milestone-0-2d-road-ux-plan.md) · [0.2C road-first design](roads/milestone-0-2c-design.md) · [Road preservation contract](../../reference/road-edit-contract.md) · [Repository roadmap](../../plans/README.md)

## Release thesis

A generated city is a starting point, not something users must accept unchanged. Road, property, plot and building edits must be previewable, independently validated and reversible without silently destroying unrelated authored work. **Real structural land editing is a prerequisite for advanced architecture**, because a building's footprint, plot membership, access and identity depend on its parent parcel.

## Revised dependencies and phases

```mermaid
flowchart TD
  A["0.2A · road graph, impact reports, preview · merged"] --> B["0.2B · conservative Apply, local reconciliation · merged"]
  B --> C["0.2C · road-first editing and local adaptation · merged"]
  C --> D["0.2D · understandable, recoverable street editing · merged"]
  D --> E["0.2E · E1–E5 merged"]
  E --> F["0.2F · advanced building design · merged"]
  F --> G["0.2G · desktop workspace rebuild"]
  G --> H["0.2H · final integration / release"]
```

| Milestone | Scope | Proposed/completed development cycles | Completion principle |
| --- | --- | --- | --- |
| **0.2A — foundations** | Road graph, stable faces, impact reports, read-only preview | A1–A5 **merged** | Inspect without mutation |
| **0.2B — conservative Apply** | Local adaptation, candidate preview, whole-edit Apply and history | B1–B5 **merged** | One verified reversible edit |
| **0.2C — road-first streets** | Street manipulation, generated-neighborhood reflow, topology, bends, building conflict policy | C1–C7 and P1–P7 **merged** | Streets drive supported local adaptation; protect authored work |
| **0.2D — road editing experience** | Readable map preview, contextual building decisions, blocked recovery and acceptance | D1–D4 **merged** in PRs #51–#53, #56 | Understand/rescue edits without technical reports |
| **0.2E — manual property restructuring** | Create/split/merge parcels, adjust plot counts and reconcile dependent references | **E1** create (merged #58); **E2** split (merged #60); **E3** merge (merged #62); **E4** plot-count editing (merged #64); **E5** integrated QA (merged #66) | No orphaned buildings or unapproved identity loss |
| **0.2F — advanced building design** | Extended 2D footprints, direct vertex/wing/hole editing, meaningful categories, QA | **F1** shapes (merged #68); **F2** direct geometry (merged #69); **F3** uses (merged #70); [**F4** integrated QA](buildings/f4-acceptance-report.md) (merged #71) | True new capabilities, no duplication of 3G/3H |
| **0.2G — desktop workspace rebuild** | Desktop and laptop UI with shared selection, Inspector, preview, and edit controls | **G1–G4 merged**; G4 acceptance [PR #87](https://github.com/xbwtyz/Mappo/pull/87) | Feature parity and a clear path from selection to decision to Apply |
| **0.2H — release hardening** | Cross-editor integration, migration audit, performance, browsers, release candidate | [**H1–H5 detailed plan**](release/milestone-0-2h-release-plan.md); H1–H5 merged; stable v0.2.0 published | Stable offline standalone with tested old saves |

The new milestone identifiers replace **older active roadmap labels**; they do not rename or invalidate already merged 0.2C/0.2D commits, earlier planning branches, historical QA records or compiled distributions. Old proposals with conflicting labels remain archived context, not the current implementation authority.

## Why the order changed

1. **Original road-first revisions:** Manual property creation/split/merge was previously called 0.2C or 0.2D. Road-first editing and then its usability work took those labels instead.
2. **Post-0.2D correction:** Rather than leave manual property restructuring as an unnamed step, it is now explicitly **0.2E**. Building design followed as **0.2F**. The desktop workspace rebuild now takes **0.2G**, with civic places deferred and release hardening in **0.2H**.
3. **Reuse existing work:** 3I already edits existing corners/dividers; 3G/3H already support building transformations, placement and basic footprint presets. New phases must extend those tools, not repeat them.
4. **Dependencies:** Property/plot creation and successor ownership must be proven before adding more complex manually authored footprints that depend on them.

## Preservation and release policy

1. An ordinary road move or land/building draft may be *previewable* without being Apply-ready. Never silently rebuild protected authored/unknown records.
2. Generated untouched parcels/buildings may adapt locally only when provenance, validated geometry and dependencies justify it. Where identity lineage or placement is ambiguous, expose the blocker and require explicit resolution.
3. Preserve stable IDs and names where provable; make split/merge predecessor/successor lineage explicit. Old customized or legacy-unknown buildings cannot be silently deleted or reassigned.
4. Validate whole-project topology, block/parcel/plot ownership, building geometry, access, civic/landscape protections, independent Apply and stale draft rejection. Use one atomic transaction with Undo/Redo.
5. v0.2.0 ships format 1, project schema 9, property-first selection, modular sources and desktop Chromium/Firefox QA. Any new schema requires a separately approved design; **supporting every historical save in future releases is optional**. Existing 0.2.0 migrations/tests are unchanged.
6. [Issues #44 and #46](release/h3-performance-audit.md) were closed following the owner's H3 review of reproduced performance evidence. Occasional shorter frame hitches remain a documented limitation; any future disruptive real-user freeze warrants a narrowly reproduced new issue rather than unbounded performance optimization. [Issue #79](https://github.com/xbwtyz/Mappo/issues/79) dead-end road deletion remains open and outside 0.2.0.
7. No mandatory onboarding tours, participant recruitment, forced feedback prompts or owner-run acceptance tasks.

## Status and next action

- **0.1.0:** archived first stable release, still downloadable.
- **0.2A–D:** merged on `main`, with D4 closeout in [PR #56](https://github.com/xbwtyz/Mappo/pull/56).
- **0.2E:** merged through [E5 #66](https://github.com/xbwtyz/Mappo/pull/66).
- **0.2F:** Complete through [F4 #71](https://github.com/xbwtyz/Mappo/pull/71). [F4 acceptance](buildings/f4-acceptance-report.md) covers cross-editor behavior and performance.
- **0.2G:** [G4 accepted and merged in PR #87](workspace/g4-acceptance-report.md). Generation/Add/Roads is the canonical desktop workspace.
- **0.2H:** [H1–H5 hardening](release/milestone-0-2h-release-plan.md) is complete. [PR #91](https://github.com/xbwtyz/Mappo/pull/91) merged and [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0) published. The [H5 report](release/h5-release-candidate-report.md) is preserved pre-release evidence; Pages is still a separately approved deployment.
- **3D:** later, after 2D is capable and stable.

Historical design plans under `docs/history/`, old planning branches and `dist/` remain unchanged.
