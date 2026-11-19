# Mappo 0.2A — Road Network Foundations: execution plan

> **Status: 0.2A implementation authorized by the owner on 2026-11-18.**
> Original design branch: `planning/mappo-0.2a-road-network-foundations`.
> A1 implementation branch: `feature/mappo-0.2a-a1-road-graph`.
> Implementation baseline: stable 0.1.0 `main` at `785e9cb2a44c40819e91a636523ac397b6660f9e`, including merged Dev 4f and release PR #21.
> Execute A1 → A2 → A3 → A4 as separate checkpoints. Each PR still needs separate owner approval before merging.
> [A1 implementation and verification record](A1_ROAD_GRAPH.md).

[0.2 roadmap](README.md) · [Preservation and QA contract](ROAD_EDIT_CONTRACT.md)

## Problem statement from current code

- `src/generators/layout.js` creates road nodes/segments, normalizes intersections, extracts planar faces and assigns block IDs while generating. Face extraction is private to generation.
- `src/core/validate-layout.js` checks connectivity, face orientation and full coverage; `src/data/project-validation.js` links faces to roads, properties, plots and buildings.
- `src/editor/property-application.js` can validate and reconcile one existing four-corner property while keeping roads/blocks unchanged. It is **not** a general road topology reconciliation engine.
- Current road and block IDs are assigned by generation order, and rerunning generation may renumber them. Identity-preserving editing needs a different mapping path.
- Some roads are special: boundary, plaza, banks, bridges, foothills, mountain passes, water/terrain boundaries. Phase A does not allow ordinary road editing to rewrite these features.

## A1 — Reusable road-graph engine

**Goal:** Inspect, normalize and validate the *existing accepted* road network independently of the procedural layout generator.

Proposed modules/interfaces (illustrative, final names may change):
- `src/core/road-graph.js`: read-only indexes `nodesById`, `roadsById`, adjacency, connected components, special-edge classification, incident roads and graph invariants.
- `src/core/road-topology.js`: reusable deterministic segment intersection / node normalization / directed-edge traversal primitives, extracted or adapted without modifying generated city output.
- `analyzeRoadGraph(city)` → graph summary + issue codes + IDs.
- `proposeJunctionMove(city, junctionId, point)` → **temporary candidate graph**; no mutation and no persistence.

Acceptance:
- All existing generated seeded shapes retain equivalent output before/after extraction (prefer deterministic byte/geometry parity fixtures).
- Every road endpoint resolves; no unsupported self-loops, invalid duplicates or unexpected disconnected components.
- Protected-edge metadata remains intact and is classified without deleting it.
- Input city/project remains byte-for-byte unchanged after analysis.
- Graph is deterministic under the same accepted input, independent of object iteration ordering.

**Out of A1 scope:** Apply, road creation/deletion, UI or project schema changes.

## A2 — Face topology and block identity reconciliation

**Goal:** Compute affected faces and match old/new city faces by topology and supported geometric relationships, without reassigning IDs because of array order.

Proposed outputs:
- `extractRoadFaces(graph, protectedGeometry)` → ordered face candidates with orientation, area and edge boundaries.
- `matchExistingFaces(oldCity, candidateFaces)` → `preserved`, `changed`, `added`, `removed`, `split`, `merged`, `ambiguous`.
- For unchanged faces and unambiguous single-face counterparts, retain original block IDs and metadata; do not fabricate stable identity for ambiguous splits/merges.
- Recheck plaza center and its face, river/lake and mountain face ownership, connected boundary edges, and district/fortification references.
- Use explicit topology/edge correspondence and geometric overlap as corroboration; do not infer identity by sequential index alone.

Acceptance:
- Correct face extraction/positive winding; no reused directed edges, orphan nodes, gaps or overlaps; area coverage within existing tolerances.
- Identical graph → identical face IDs and metadata.
- Moving an ordinary junction without changing the logical face set retains each block ID.
- Split, merge and ambiguous matches are **diagnostics**, not silent assignments.
- Protected features are never silently rewired.

**Out of A2 scope:** Automatic parcel relocation or committing a changed road graph.

## A3 — Dependency impact report and strict-preservation classification

**Goal:** Explain exactly which accepted objects would be affected by a candidate road change.

Proposed report shape (illustrative):
```json
{
  "status": "safe | needs-review | invalid",
  "operation": "move-junction",
  "roadIds": ["RD-..."],
  "junctionIds": ["N-..."],
  "affected": [
    {
      "kind": "property | block | building | plot | district | defense | water | terrain",
      "id": "PROP-...",
      "code": "setback | frontage | containment | topology | protected-edge | ...",
      "message": "Specific conflict and reason"
    }
  ],
  "preservedIds": ["..."],
  "requiresReconciliation": true,
  "canApplyIn02A": false
}
```

Rules:
- **Safe:** candidate topology and all dependent accepted relationships validate unchanged or via proven non-destructive block updates.
- **Needs review:** graph is geometrically well-formed but affects property frontage/setback, parcel geometry, plot/building containment, ownership, district/defense dependency or identity matching.
- **Invalid:** disconnected graph, duplicate/inverted/degenerate faces, boundary escape, missing road endpoints, impossible plaza/topology, or prohibited protected-edge rewrite.
- When uncertainty remains (e.g., an unrecognized dependency), classify conservatively as **Needs review** or **Invalid**, not Safe.
- Preserve detailed machine-readable issue codes, affected IDs, old/new geometry metrics and a clear human explanation; avoid unhelpful generic errors.
- **No deletion, relocation or acceptance** in Phase A. Reconciliation proposals are a future phase.

Acceptance:
- Deterministic outcomes for unchanged, moved, intersecting and disconnected road cases.
- Tests cover road setbacks, building/plot/block references, plazas, waterways/bridges, mountains/passes, districts and walls/gates.
- Reports are read-only and do not mutate or serialize accepted city geometry.

## A4 — Road/junction inspection and non-destructive preview

**Goal:** Users can inspect a road or junction, try a proposed junction position, and understand the A3 impact report.

Proposed interface:
- In existing property-first city workflow, add explicit **Road inspection mode** rather than hijack property selection.
- Click/tap junction or road: show record ID, class, endpoint IDs, connected-road count, and protected status.
- For an eligible ordinary junction: drag or input proposed X/Y; display existing geometry and candidate in separate visual styles.
- Color/line convention: existing network normal; proposed path dashed; preserved/affected blocks subtly highlighted; issues highlighted; invalid candidate in error styling.
- Show status **Safe**, **Needs review**, or **Invalid**, counts and a list of affected IDs with actionable descriptions.
- Reset/Cancel restore exactly the initial accepted view and cancel all pending preview data.
- **No functional Apply in A4**; label future acceptance as part of 0.2B. Do not present an enabled operation that cannot commit.
- Responsive mouse/touch/keyboard access, screen-reader-readable status and no focus trap.

Acceptance:
- Selection and preview work across four viewport classes, Chromium and Firefox.
- Preview updates never mutate accepted geometry, saved project file or recovery snapshots.
- Valid/corrected state clears stale warnings; no escape from preview causes a save or irreversible operation.
- Affected-object highlights match the A3 report precisely.
- UI stays understandable alongside existing property, water, terrain and building modes.

## Implementation dependencies, order and merge gates

1. **A1 first.** Structural extraction with *generation parity* and pure graph QA is the riskiest necessary foundation.
2. **A2 second.** Face matching and identity semantics must be validated before any impact UI.
3. **A3 third.** A structured dependency/impact report should exist before presenting a preview to users.
4. **A4 last.** UI consumes the established read-only APIs; no additional geometry authority in the renderer.

Each approved checkpoint should produce modular source + regression tests + versioned offline `.html` distribution, commit on a dedicated branch and open a PR. Do not merge until independent approval and all CI/browser QA pass. The work may be split into smaller sub-PRs if A1/A2 need it; always start a new implementation branch from current merged `main`.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Extracted face traversal changes generator output | Lock existing seeded golden fixtures, compare graph/face geometry, retain deterministic tie-breaking |
| Stable block IDs cannot be inferred after split/merge | Represent ambiguity explicitly; refuse automatic reassignment |
| Special roads interact with water/terrain/fortifications | Protect edges and report affected references; postpone structural changes |
| Large maps make analysis expensive | Use indexed adjacency, bounded validation, dirty-region analysis where possible; benchmark pathological cases |
| Inconsistent frontend and core statuses | A3 owns codes/classification; renderer only displays data |
| Unintentional mutation of existing project | Clone/freeze-aware pure tests; verify accepted payload identical before/after A1–A4 |
| Premature schema bump | Keep transient analyses out of saves; migrate only on approved persistence change |

## 0.2A exit criteria

- [ ] Existing generation geometry/parity retained across supported morphology seeds.
- [ ] Reusable road/junction topology API, independent of generation.
- [ ] Block identity matching is stable or explicitly marked ambiguous.
- [ ] Deterministic, ID-specific impact reports distinguish Safe / Needs review / Invalid.
- [ ] Working non-destructive junction preview with no Apply.
- [ ] No accepted-project mutations, deleted identities or save-format regression.
- [ ] Node + compiled HTML parity + Firefox/Chromium viewport QA green.
- [ ] Each implementation PR reviewed and separately approved before merge.

**Implementation approval does not authorize merging a checkpoint PR.**
