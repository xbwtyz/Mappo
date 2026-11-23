# Mappo 0.2.x — Engine Limitations Register

> **Status: historical candidate register.** This 18-item limitation assessment was originally drafted against published v0.2.0 / `main` commit `799532b6fb35`; the rows below retain original issue classifications and proposed priorities, **not current implementation status**. For merged 0.2.1–0.2.14-dev work and the completed frontage fixes ([PR #128](https://github.com/xbwtyz/Mappo/pull/128), [PR #129](https://github.com/xbwtyz/Mappo/pull/129)), use the [living 0.2.x roadmap](ROADMAP_0_2X.md). Open, deferred and evidence-gated issues still require explicit owner review. Do not mistake this historic baseline for an authorization to implement.

## Classification rules

- **Confirmed bug:** A user-reported behavior is already tracked and inconsistent with the intended supported workflow (A01 / existing [#79](https://github.com/xbwtyz/Mappo/issues/79)).
- **Confirmed restriction:** The current source and/or acceptance contracts expressly reject a geometry class or action; relaxing it is a **feature/architecture decision**, not necessarily bug fixing.
- **Intentional protection:** Existing guardrail prevents corrupt/unsafe cities; it is **not** automatically a problem to remove.
- **Evidence-gated performance/scale:** Do not open new defects based solely on old benchmarks or theoretical caps.
- **New capability:** An extension (e.g., whole-city export) rather than regression; remains a legitimate 0.2.x candidate if owner wants it.

## Full candidate register

*Historical planning snapshot: the Target column shows original proposals, some of which have since been implemented and merged. Refer to the living roadmap and issue states for current disposition.*

| ID | Proposed issue | Classification | Priority | Target |
|---|---|---|---|---|
| [A01](issues/A01.md) · [#79](https://github.com/xbwtyz/Mappo/issues/79) | Connected interior stub after segment deletion; clearance without new frontage; generated-only reconciliation | Confirmed bug / engine gap | P0 | **0.2.1 architecture approved**; Issue #79 updated; implementation pending |
| [A02](issues/A02.md) · [#94](https://github.com/xbwtyz/Mappo/issues/94) | Evaluate support for multiple disconnected street networks | Deliberate rule / feature expansion | P3 | Unassigned |
| [A03](issues/A03.md) · [#95](https://github.com/xbwtyz/Mappo/issues/95) | Extend road intersection normalization for coincident and collinear contacts | Confirmed documented restriction | P1 | Unassigned — after 0.2.1 |
| [A04](issues/A04.md) · [#96](https://github.com/xbwtyz/Mappo/issues/96) | Design controlled editing of protected road connections | Deliberate safety boundary / feature expansion | P2 | Unassigned |
| [A05](issues/A05.md) · [#97](https://github.com/xbwtyz/Mappo/issues/97) | Assess spline or curved-street geometry beyond editable polyline bends | New capability / geometry model expansion | P3 | Unassigned |
| [A06](issues/A06.md) · [#98](https://github.com/xbwtyz/Mappo/issues/98) | Expand bounded road topology reflow for large changes and ambiguous face ownership | Confirmed architectural limit | P1 | Unassigned — after 0.2.1 |
| [B01](issues/B01.md) · [#99](https://github.com/xbwtyz/Mappo/issues/99) | Support irregular multi-vertex and concave property boundaries | Confirmed geometry-model restriction | P1 | Unassigned — foundational parcel wave |
| [B02](issues/B02.md) · [#100](https://github.com/xbwtyz/Mappo/issues/100) | Extend property splits beyond straight frontage-to-rear dividers | Confirmed feature restriction | P2 | Unassigned |
| [B03](issues/B03.md) · [#101](https://github.com/xbwtyz/Mappo/issues/101) | Support partial-edge and irregular property merging | Confirmed feature restriction | P2 | Unassigned |
| [B04](issues/B04.md) · [#102](https://github.com/xbwtyz/Mappo/issues/102) | Add flexible plot subdivisions and multi-divider transactions | Confirmed feature restriction | P2 | Unassigned |
| [B05](issues/B05.md) · [#103](https://github.com/xbwtyz/Mappo/issues/103) | Improve author-preserving parcel decisions after large road changes | Confirmed reconciliation limitation | P1 | Unassigned |
| [C01](issues/C01.md) · [#104](https://github.com/xbwtyz/Mappo/issues/104) | Support compound connected and detached building components | New capability / current design restriction | P2 | Unassigned |
| [C02](issues/C02.md) · [#105](https://github.com/xbwtyz/Mappo/issues/105) | Support multiple building-topology operations per draft transaction | Confirmed editing restriction | P2 | Unassigned |
| [D01](issues/D01.md) · [#106](https://github.com/xbwtyz/Mappo/issues/106) | Evaluate unified and persistent edit history across Mappo workspaces | Confirmed history scope limitation | P2 | Unassigned |
| [D02](issues/D02.md) · [#107](https://github.com/xbwtyz/Mappo/issues/107) | Investigate residual road-editor frame hitches and worker fallbacks | Known performance caveat; not proven current bug | Conditional | Unassigned — evidence gate first |
| [D03](issues/D03.md) · [#108](https://github.com/xbwtyz/Mappo/issues/108) | Audit graph and reconciliation work budgets against real city sizes | Intentional safety caps / scale proposal | P3 | Unassigned |
| [E01a](issues/E01a.md) · [#109](https://github.com/xbwtyz/Mappo/issues/109) | Assess larger portable project imports beyond 20 MiB | Explicit import limit / scale proposal | P3 | Unassigned |
| [E01b](issues/E01b.md) · [#110](https://github.com/xbwtyz/Mappo/issues/110) | Add whole-city PNG export at selected resolution | New output capability / known limitation | P2 | Unassigned |

## Groups and shared architecture

| Group | IDs | Main ownership | Dependency / ordering logic |
|---|---|---|---|
| **A — Road topology** | A01–A06 | Road graph, face extraction, crossing normalization, topology/local reflow | A01 first; A03/A06 next if supported use cases; A02/A04/A05 are design-dependent extensions |
| **B — Parcel and plots** | B01–B05 | Four-corner geometry, plot tiling, property split/merge and road-dependency reconciliation | B01 is the foundation for B02–B04; B05 requires road-face lineage and author-preserving decisions |
| **C — Buildings** | C01–C02 | Footprint geometry, direct edit session and transaction history | C02 can proceed independently; C01 benefits from settled complex parcel geometry |
| **D — History, performance, scale** | D01–D03 | Scoped Undo/Redo, workers/fallback, graph/work budgets | D01 design after stable transaction semantics; D02/D03 need evidence before optimization |
| **E — Project and export** | E01a/E01b | File IO, validation, canvas rendering | Larger imports need memory evidence; whole-city export is a separate capability |

## Explicit non-goals of this program

3D rendering, Minecraft export, civic-site authoring, a population simulation, a mobile-first redesign and mandatory onboarding remain on other product roadmaps. They should not be described as known defects of v0.2.0.

## Guardrails that must not be removed without replacement

- One accepted authoritative 2D city and fully isolated non-destructive drafts.
- Full graph/face/dependency/portable-project validation before atomic Apply.
- Preservation of custom IDs, metadata, property/plot/building ownership and protected infrastructure.
- Reject unsupported saves without replacing the open city; current schema-9 and format-1 contracts stay until separately reviewed.
- Offline standalone HTML with deterministic source build and identical root/dist output.
- Frozen fixtures, prior releases and historical `dist/` builds are retained.

## Issue lifecycle

`Planning draft` → `Published tracking issue` → `Owner-reviewed implementation scope` → `Assigned release` → `Scoped implementation approval` → `PR + tests` → `Approved merge` → `Separately approved release` → `Closed with evidence`.

The first item is already [Issue #79](https://github.com/xbwtyz/Mappo/issues/79), which has been **updated, not duplicated**. Its **architectural choices are approved** and its [replacement body is drafted](issues/issue-79-update-draft.md); the owner approved updating the existing GitHub issue with that text. All 17 other tracking issues (#94–#110) have been published. They are proposals, **not** confirmed bugs or authorized implementation. Confirm user stories, architecture and acceptance criteria before coding.