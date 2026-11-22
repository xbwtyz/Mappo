# Mappo 0.2.1 — Allow road deletion to leave a connected dead end

**Target:** v0.2.1  
**Category:** Road graph / bounded faces / neighborhood reconciliation  
**Tracking:** Existing Issue #79 (A01)  
**Architecture:** Owner-approved D-021-1=A, D-021-2=A, D-021-3=A, D-021-4=A  
**Status:** Design agreed; implementation not yet authorized

## User problem and historical reproduction

Deleting an ordinary interior road segment may leave a still-connected road ending at an interior degree-one junction. The current engine rejects the proposal instead of allowing the road to remain as a legal dead end.

**Original report (Mappo 0.2-dev.g3b):** Select an ordinary segment in **Roads → Edit controls → Change street connections → Preview removal**, where deletion would leave a connected surviving branch. The preview was blocked with:

> Junction N-0195 ends without a closed city face.

`N-0195` identifies the example city only. The original report did not capture the project seed or deleted segment ID. Before coding, reproduce this on the current baseline with a deterministic city/project fixture, morphology, removed road ID, resulting stub IDs and exact diagnostics; do not claim that this reproduction was already rerun.

**Expected user experience:** Preview the removal, see the retained ordinary dead-end road and proposed local neighborhood changes, resolve or understand any genuine conflicts, then safely Apply; Cancel, Undo/Redo and portable save/reopen must behave consistently.

## Approved scope and non-goals

| Decision | Owner-approved choice A | Required boundary |
|---|---|---|
| **D-021-1 — Topology scope** | Support ordinary **connected interior dead-end stubs produced by otherwise supported road deletion** | Keep one connected city road network; do not broaden this issue to all dead-end creation/movement/reconnection, disconnected streets, arbitrary branch graphs or protected-road operations |
| **D-021-2 — Access and frontage** | **Road corridor and setback clearance only** | Keep the stub visible and physically clear of parcels/plots/buildings; **do not grant new parcel frontage/access rights or generate new parcels that face the stub** |
| **D-021-3 — Local development** | Adapt **proven generated, untouched** local records only | Preserve customized, user-authored and unknown-provenance parcels/buildings/metadata; unresolved impacts block with concrete reasons, not silent replacement or automatic custom restructuring |
| **D-021-4 — Delivery** | **One PR**, with internal P1–P4 checkpoints | No multiple implementation PRs by default; any new data schema or materially expanded scope pauses for separate approval |

**Retain** existing protections for coastline, water, bridges, city boundaries, plaza, terrain passes, defenses, invalid crossings and disconnected components. **Do not weaken global validation** to make the road edit appear successful.

## Technical contract

1. **Graph:** A supported interior terminal node may have degree one, but orphan junctions, disconnected graph components, invalid road intersections and protected-road mutations remain invalid. Keep unchanged road IDs, kinds and endpoints stable.
2. **Faces:** A surviving terminal street is a **connected road corridor, not a closed face boundary**. Preserve deterministic positive-area bounded block faces and correct boundary coverage, including protected face ownership. Choose exact traversal/representation during P1 source review—not by removing `dangling-junction` alone.
3. **Corridor:** Model road width and applicable setbacks in the surrounding land/placement checks. No property, plot, building, or access path may unlawfully overlap this corridor. **Corridor clearance does not imply new frontage eligibility.**
4. **Reconciliation:** Update only the affected local area. Preserve unrelated neighborhoods. Permit replacement/reshaping of proven generated untouched records only when ownership, lineage and clearance validate; otherwise report the blocked record and reason. Preserve all customized/legacy-unknown information unless an already-supported, separately authorized operation applies.
5. **Apply/persistence:** Reuse the existing authoritative independent Apply validation, stale-revision protection and atomic road edit history. Full project and portable round-trip validation must pass. Keep schema **9**, portable envelope **1**, and one offline standalone HTML unless a distinct schema proposal is approved.

## Implementation checkpoints (one PR)

- [ ] **P1 — Reproduction and contract:** Capture the exact deterministic deletion fixture; map old/new road nodes, bounded faces, affected parcels and the corridor. Compare face representation approaches; select one preserving validation and no-new-frontage semantics.
- [ ] **P2 — Graph and faces:** Accept only validated connected ordinary interior terminal roads; keep other invalid topologies blocked; preserve deterministic face coverage and protected geometry.
- [ ] **P3 — Parcel and building reflow:** Enforce corridor width/setback, explicitly prohibit newly granted stub frontage, reconcile proven generated untouched local development and block ambiguous authored conflicts without accepted-city mutation.
- [ ] **P4 — Editor and acceptance:** Preview/surviving-stub rendering, understandable impact/blocker messages, atomic Apply, Cancel/Reset, Undo/Redo, portable save/reopen, browser acceptance and standalone build parity.

## Acceptance criteria

- [ ] Deleting an eligible ordinary interior segment can produce a connected terminal stub; the surviving road remains in preview, accepted graph, rendered map and saved project.
- [ ] Bounded faces, affected blocks and generated property/plot/building placements remain valid, deterministic and locally reconciled; road corridor/setback stays clear.
- [ ] No new parcel frontage/access is granted along the new stub and no frontage-oriented lots are newly generated there.
- [ ] Customized, authored and unknown-provenance records are neither silently removed nor modified; unresolved ownership/clearance remains a clear, actionable Apply blocker.
- [ ] Orphan nodes, disconnected components, invalid crossings, protected changes and stale revisions still fail safely; no mutation of accepted city, edit history or recovery on rejected/canceled drafts.
- [ ] A valid Apply commits once; Undo/Redo restores the precise prior/next graph, blocks, development and IDs; schema-9 project export/reopen preserves the result without regeneration.
- [ ] Focused tests exercise legal/illegal cases across planned/radial/organic/linear morphologies and Small/Large examples; Chromium and Firefox desktop QA pass, including offline standalone `file://` and `index.html` ↔ versioned `dist` parity.
- [ ] Review-ready PR passes the **full existing six-runner CI matrix** (two Node shards, desktop/roads/property/integration browser suites, aggregate required check). Provide exact-head CI evidence and a user-facing before/after summary. Merge and release each need separate approval.

## Relative complexity and risks

**High complexity.** Road graph validity, face traversal, area coverage, local block identity, frontage rules, clearance and edit transactions are coupled. Highest risks are accepting a non-simple bounded face, allowing parcels to occupy a terminal road corridor, inadvertently assigning new frontage, losing authored IDs/data, or bypassing global project validity. A schema change or major scope increase is a **stop-and-request-approval condition**, not implied by this issue.

## References

- Existing issue: https://github.com/xbwtyz/Mappo/issues/79
- Road graph: https://github.com/xbwtyz/Mappo/blob/main/src/core/road-graph.js
- Face extraction: https://github.com/xbwtyz/Mappo/blob/main/src/core/road-faces.js
- Road topology reflow: https://github.com/xbwtyz/Mappo/blob/main/src/core/road-topology-reflow.js
- Local reflow: https://github.com/xbwtyz/Mappo/blob/main/src/core/neighborhood-reflow.js
- Authoritative Apply: https://github.com/xbwtyz/Mappo/blob/main/src/editor/road-application.js