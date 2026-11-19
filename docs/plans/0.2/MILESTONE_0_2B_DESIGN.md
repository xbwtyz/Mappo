# Mappo 0.2B — Controlled Road Editing and Local Reconciliation
**Approved conservative design · 2026-11-18 · B1 implementation authorized only**

Status: **B1 merged; B2 implementation authorized; B3–B5 remain unapproved.** This document expands the original 0.2B roadmap proposal to allow *conservative, explicit local reconciliation* for supported ordinary road movements. A5 [PR #26](https://github.com/xbwtyz/Mappo/pull/26) was merged. B1 [PR #27](https://github.com/xbwtyz/Mappo/pull/27) passed CI and merged. B2 is in its own implementation cycle and is not approved for merge.

Related: [0.2 roadmap](README.md) · [0.2A plan](MILESTONE_0_2A_PLAN.md) · [preservation contract](ROAD_EDIT_CONTRACT.md).

## 1. Product problem and acceptance story

0.2A provides stable road graph / face analyses, detailed impact diagnostics, and read-only previews. Yet moving a road through a developed neighborhood usually produces dependent-object warnings and no usable edit. 0.2B must make supported real edits possible without regenerating a city.

**Primary acceptance story:** In a developed city, select an ordinary junction, move it, inspect the proposed roads/blocks/properties/plots and all retained buildings, Apply a fully validated supported transformation, save and reopen the project, then Undo and Redo the complete edit. IDs, metadata, protected geometry and unrelated neighborhoods remain unchanged.

**Policy:** Preserve first; adapt the neighborhood second; require explicit decisions rather than guessing when preservation cannot be proven. No silent destruction, reassignments or relocations.

## 2. Scope and boundaries

### In scope
- Move ordinary junctions, initially where face topology can be matched unambiguously (same logical face set).
- Recalculate connected road segments and affected block geometry.
- Reconcile supported parcel / plot geometries, frontage and access locally.
- Show original vs proposed geometries, impacted IDs and before/after metrics.
- Validate complete candidate project and Apply atomically, with one reversible Undo/Redo transaction.
- After safe movement is operational: evaluate bounded segment moves, road insertion, removal and classification in B5, each gated by independently proven invariants.

### Out of scope for initial B1–B4
- Silent building relocation, resizing, regeneration, deletion, or reattachment.
- Ambiguous block split/merge ownership and property restructuring (primarily 0.2C).
- Editing protected city-boundary, plaza, bridge, river/lake/coast bank, foothill, mountain pass and fortification-sensitive connections without dedicated proof.
- Arbitrary curved roads, arbitrary concave parcel transformations, full-city regeneration, population simulation and 3D.
- Treating a geometrically valid road graph alone as proof the saved city is valid.

**B5 scope gate:** If add/remove/classify cannot preserve dependencies with a precisely specified and tested operation, defer that operation rather than force a fragile 0.2B release.

## 3. Preservation invariants

| Entity | Must preserve or explicitly reject |
| --- | --- |
| City / accepted project | City ID; untouched records byte-for-byte or semantically identical as appropriate; accepted state never mutates during preview |
| Junctions / roads | IDs of logically surviving nodes/edges; classes, endpoints and protected reasons unless an explicitly supported classification change; new IDs collision-free and deterministic |
| Blocks / faces | IDs, ring/sector/usage and metadata on unambiguous correspondence; ambiguous split/merge blocks acceptance |
| Properties | IDs, custom names/uses, ownership, association, and all opaque extension fields; reshape only proven supported geometry |
| Plots | IDs and parent property/road relationships; no overlaps, holes, or orphan references introduced |
| Buildings | Exact IDs, position, footprint, holes, entrance, orientation, building data and custom fields; no automatic relocation or resizing; must remain valid and accessible |
| District / defense | District membership, wall/gate/tower records and their references; unresolved impact blocks Apply |
| Water / terrain / special edges | No unapproved changes to banks, bridges, passes, faces or owner references |
| Persistence / recovery | Schema 9 by default; transient candidate excluded from portable/recovery state; complete accepted candidate survives encode/decode |
| History | Exactly one atomic transaction for a successful edit; failure/cancel produces no transaction; Undo and Redo restore exact approved states |

Unknown dependency fields must be preserved *and* explicitly classified conservatively if their compatibility with the edit cannot be proved. A field's mere survival is not proof of semantic safety.

### Geometry invariants
- Accepted road graph remains connected and valid; no duplicate/overlapping edges, degenerate roads, unnormalized intersections or boundary escape.
- Faces maintain positive winding, valid directed-edge traversal and coverage within existing project tolerances.
- Matched block identities are unambiguous; existing protected face and plaza relationships remain valid.
- Reconciled parcels/plots remain valid, non-overlapping, inside their owner block/property, with frontage, access and setback checks satisfied.
- Every building footprint, entrance, access path, and relationship remains valid under the proposed block/parcel geometry.
- No unaffected project records are rewritten as collateral damage; no global procedural regeneration.

## 4. Architecture and data flow

```text
ACCEPTED PROJECT + MOVE INTENT
        |
        v
A1 road graph -> A2 faces + stable identity correspondence
        |
        v
B1 local candidate construction and dirty-region inventory
        |
        v
B2 supported property/plot reconciliation -> immutable candidate snapshot
        |
        v
A3 / A5 diagnostics + existing project validators + explicit preservation diff
        |
        v
B3 visual before/after preview  [no persistence]
        |
        v
B4 atomic Apply gate: clone -> verify -> format round-trip -> commit + Undo
```

Proposed module boundaries (names illustrative):
- `src/core/road-reconciliation.js`: pure deterministic changed-region identification, candidate graph / faces / preservation mapping, rejection codes.
- `src/core/parcel-reconciliation.js`: supported local property and plot transforms, access/frontage checks and provenance of each changed field.
- `src/editor/road-application.js`: candidate verification, atomic transaction boundary, Undo/Redo integration.
- `src/ui/road-editing.js` and `src/renderer/road-editing.js`: UI and preview only; no geometry or safety authority.

Proposed result contract (illustrative):

```js
{
  operation: 'move-junction',
  candidate: { /* complete transient validated project, never serialized during preview */ },
  changed: [{ kind: 'property', id: 'PROP-...', fields: ['boundary', 'frontage'] }],
  preserved: [{ kind: 'building', id: 'BLDG-...' }],
  unresolved: [{ code: 'building-clearance', kind: 'building', id: 'BLDG-...' }],
  diagnostics: { status: 'safe | needs-review | invalid', affected: [] },
  validation: { graph: 'pass', faces: 'pass', project: 'pass', roundTrip: 'pass' },
  applyReady: false
}
```

The existing A3 status remains authoritative for raw impact analysis; **applyReady** is a separate and strictly stronger result computed only after completed reconciliation and complete candidate validation. A review-required original impact is not automatically a veto if B2 fully resolves it, but unresolved needs-review/invalid/incomplete results always block Apply. Never change A3 severity codes merely to make Apply easier.

Dirty region should be derived from incident roads, old/new face boundaries and their dependent entities, expanded until no affected ownership/frontage/access reference is missed. Always use full-project validation before Apply, even if geometry computation is local.

## 5. Development cycles and gates

Each approved B-cycle is one focused **development pass with one final commit**, one branch and one PR; internally test/fix freely. A cycle's implementation approval does not grant merge approval. Start each branch from latest explicitly approved merged `main`.

### B1 — Pure candidate and local topology engine
**Goal:** Given a proposed ordinary junction move, construct graph/face candidate with stable identities, explicit changed-region inventory, and no accepted mutation.
- Restrict initial successful cases to topology-preserving, unambiguous face mapping.
- Reject protected edges, invalid crossings, connectivity failures, unsupported face splits/merges and ambiguous ownership.
- Derive deterministic diff and reason-coded outcomes; no Apply/UI yet.

**Tests and exit gate:** seeded morphology/size/outlines parity; unchanged and movable junction cases; intersection/degenerate/boundary/protected rejection; deterministic reordering; frozen-input/no mutation; stable face IDs; work-budget/performance tests. Candidate engine API and test evidence in PR. No merge until green CI and owner approval.

### B2 — Supported property/plot reconciliation
**Goal:** Refit affected property and plot boundaries and frontages for a limited, explicitly modeled geometry subset without moving buildings.
- Derive block -> property -> plot -> building dependency order; do not rely on positional array indices.
- Maintain stable relationships and custom metadata; recompute only justified geometry fields.
- Preserve building footprints/entrances/access/clearance exactly; reject conflicts or unsupported parcel forms.
- Return a clear per-object change provenance (old/new, field reason, unresolved dependency).

**Tests and exit gate:** simple developed blocks with small safe moves; several adjacent parcels; frontage revalidation; parcel/plot coverage/containment; building setback/access near edge; disjoint and custom-shape rejection; ownership/district/defense and opaque data preservation; deterministic repeated runs. Full candidate project validation required for supported fixtures. No building relocation. No merge until green CI and owner approval.

### B3 — Visual, non-destructive reconciliation preview
**Goal:** Replace abstract only-warning previews with real proposed local block/property/plot geometry.
- Overlay original vs candidate shapes; indicate unchanged/resized/unresolved entities.
- List exact IDs and before/after area, frontage and relevant clearance/access measurements.
- Highlight selected record and offer Locate; A5 grouped descriptions remain available.
- Reset/Cancel/Escape/navigation/replacement must discard candidate and restore entry workspace; phone/keyboard/touch accessibility maintained.
- Preview never touches accepted project, history, file revisions, autosave or recovery.

**Tests and exit gate:** browser matrix Chromium + Firefox at 1440x900, 5120x1440, 768x1024, 390x844; keyboard, pointer and touch paths; stale callback/cancellation; exact report-to-highlight matching; hidden/off-screen objects; save/recovery consistency; screen-reader live status. No merge until green CI and owner approval; physical-device manual QA noted separately.

### B4 — Atomic Apply / Undo / Redo
**Goal:** Accept only fully proven candidate projects in one reversible edit.
1. Verify session/project revision and candidate freshness.
2. Clone accepted project and calculate complete candidate.
3. Validate graph, face IDs, all parcels/plots/buildings and district/defense/protected contexts.
4. Verify format-1/schema-9 portable encode/decode equivalence and accepted persistence invariants.
5. Reject if any invalid/incomplete/unresolved issue remains.
6. Commit accepted project as **one atomic history entry**, increment file revision once, and trigger normal save/recovery.
7. Undo restores exact prior project; Redo restores exact committed project.

**Tests and exit gate:** invalid Apply/exception injection leaves project/history/revision identical; stale preview rejection; repeated Apply, Undo/Redo, navigation and load/replacement; schema-9 legacy save fixtures and full round-trip; no changes to untouched IDs and metadata; browser QA and offline build. No merge until green CI and owner approval.

### B5 — Expanded operations + hardening
**Goal:** Safely expand to bounded road-segment movement and eligible creation/removal/class changes only when operation-specific invariants are satisfied.
- Segment moves must preserve graph connectivity and revalidate both endpoints and dependencies.
- Road creation may be limited to supported existing nodes / regions with unambiguous identity rules; no automatic split/merge property ownership.
- Removal may be limited to geometries where no block merge or dependent ownership ambiguity occurs.
- Classification changes may never silently remove protected attributes or invalidate infrastructure.
- If a feature cannot pass these contracts, keep it inspection-only and defer advanced cases to 0.2C or later.

**Tests and exit gate:** negative topology cases; collision-free unique IDs; operation-specific inverse Undo/Redo; cross-mode edits; worst-case city performance; regression against 0.1 / 0.2A; full Chromium/Firefox viewport suite; reproducible versioned offline HTML. No merge until green CI and owner approval.

## 6. Every-cycle QA and delivery protocol

1. Owner approves the specific B-cycle implementation scope and merged baseline.
2. Create new feature branch from current merged `main`; do not alter `main`.
3. Implement/fix the full approved cycle; maintain modular source and regression tests.
4. Run focused tests, full Node suite, build reproducibility/root HTML parity and browser matrix for UI changes.
5. Ensure format-1/schema-9 portable/recovery compatibility; require schema-10 design and explicit approval if persisted model truly changes.
6. Make **one final development commit**, including versioned `dist/mappo-0.2-dev.bN.html` and root `index.html`, retaining earlier distributions.
7. Open **one PR**, attach test summary and limitations. Leave unmerged until CI succeeds and owner expressly approves merge.

Build, QA and merge are separate gates. PR review and release tags are not implicit in implementation approval.

## 7. Core edge cases and decisions

| Scenario | Policy |
| --- | --- |
| Small junction move reshapes a block and parcels but buildings still fit | Reconcile supported parcels; validate; permit explicit Apply if all checks pass |
| Road approaches a building footprint or entrance | Block acceptance rather than relocate, shrink or delete building |
| Boundary/plaza/bridge/pass/bank edge changes | Invalid/protected; inspection only until dedicated support |
| Road crossing introduces an unsplit junction | Invalid; user corrects proposal |
| Existing blocks split or merge ambiguously | Block; property restructuring in 0.2C or separately approved design |
| Unknown extension/dependency data | Preserve verbatim; unresolved semantics block Apply |
| Preview analysis times out or throws | Report unavailable / incomplete; Apply disabled |
| Project changes while preview is open | Invalidate stale candidate; require new analysis |
| Candidate can be serialized but fails project invariants | Reject; serialization success alone never grants safety |

## 8. 0.2B exit criteria

- [ ] Move an ordinary junction in a developed neighborhood with supported block/property/plot adaptation.
- [ ] Show complete, inspectable before/after geometry and retained objects.
- [ ] Ensure no building is silently moved, resized, removed or reattached.
- [ ] Preserve identities, metadata, ownership and unrelated records; flag unresolved cases rather than guessing.
- [ ] Accept fully validated candidate with one atomic Apply and Undo/Redo transaction.
- [ ] Save/reopen supported project files with exact accepted geometry and compatible schema.
- [ ] Deliver tested supported road operations (bounded B5 subset; defer unsafe ones explicitly).
- [ ] Node, compiled parity, browser/viewport and preservation/failure-path CI green.
- [ ] Each B-cycle PR independently reviewed and explicitly approved for merge.

**B1 is merged; B2 implementation is authorized, but B2 merge and B3–B5 implementation still require independent owner approval.**
