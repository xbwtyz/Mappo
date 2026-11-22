# Mappo 0.2.1 — Connected Dead-End Streets

> **Milestone:** 0.2.1 · **Issue:** [#79 — Allow road deletion to leave a connected dead end](https://github.com/xbwtyz/Mappo/issues/79) · **Status:** **Four architectural decisions approved (all A)**; technical design and implementation pending. **GitHub issue documentation published; no source changes authorized**. Existing issue is **not** to be duplicated. Baseline: v0.2.0 project schema 9 / envelope 1, current `main` `799532b6fb35`.

## 1. Problem and outcome

In 0.2.0, deleting an ordinary street can leave a useful connected dead-end stub. Today the plan is rejected with **`Junction … ends without a closed city face`**, because `buildRoadGraph` emits a `dangling-junction` for degree-one nodes, while `extractRoadFaces` assumes closed simple ring traversal. Simply removing the error is **insufficient**: the retained street must remain in the accepted graph, be rendered and serialized, and reserve corridor/clearance through a block that may change shape after deletion.

**Desired user experience:** Select an ordinary street segment → preview its removal → see the still-connected stub and surrounding changed blocks/parcels/buildings → resolve only genuine impacts → Apply safely → Undo/Redo or save/reopen with identical accepted results.

**Before:** A valid-looking segment deletion that creates a connected dead end is blocked before Apply.  
**After (target):** A supported ordinary dead-end street is retained as road infrastructure; surrounding parcels adapt without occupying its corridor.

## 2. Owner-approved 0.2.1 architectural contract

The following are **approved scope decisions**, not questions for implementation to decide independently.

| Decision | Approved choice A | Practical boundary |
|---|---|---|
| **D-021-1 — Dead-end scope** | Support connected ordinary **interior** terminal stubs resulting from an otherwise supported road deletion | Not general dead-end creation, reconnection, moving terminal branches, disconnected islands, protected edges or unrestricted topology |
| **D-021-2 — Frontage** | **Corridor/clearance only** | Reserve road width and setbacks; **do not create new road-frontage eligibility, property access rights or frontage-based development** along the stub |
| **D-021-3 — Development** | Reconcile **proven generated, untouched** development only | Preserve custom/user-authored/legacy-unknown records; if a safe candidate cannot be proven, block Apply with specific explanation; do not silently move, delete or rebuild authored content |
| **D-021-4 — Delivery** | **One implementation PR**, with P1–P4 internal checkpoints | Owner must separately authorize coding, PR merge and release; scope escalation or new schema requires fresh approval |

**Acceptance target:** A single ordinary road deletion leaves an interior, connected surviving stub, keeps the closed city faces valid, reserves the physical corridor without adding new frontage, and safely reconciles only proven generated development. Additional ordinary stub cases may be covered where they follow the same validated contract; that does **not** authorize all road editing operations.

- **In scope:** An ordinary road deletion that leaves a **connected interior terminal stub** in the existing single city network; the previously failing one-stub case is mandatory. Broader operations involving pre-existing stubs are not implicitly in scope.
- **Graph:** Distinguish an *ordinary degree-one terminal* from an **orphan node** or **disconnected component**. Keep road identity, classification and endpoints of surviving streets. Topologically bridge-like terminal segments must not be misclassified as closed parcel boundaries.
- **Faces:** Continue extracting positive-area bounded faces and preserving exact city/boundary coverage. Treat terminal interior streets as graph corridors, not artificial block rings. Preserve protected boundary/water/terrain/plaza faces.
- **Development:** Reserve the full street corridor including applicable setback/width; no overlapping property, plot, building or invalid access path. **No new frontage/access eligibility** is conferred by the stub. Reconcile only **proven generated, untouched** local development where safe; protect custom names, IDs, geometry and unknown fields. Block unresolved authored conflicts with a locatable, actionable reason, without inventing a new custom restructuring workflow.
- **Apply:** Independently re-run graph/face/ownership/corridor and full project/portable round-trip validation on the current accepted revision; commit once or leave everything unchanged.
- **History:** One coupled Undo/Redo transaction; no persistent edit-history promise. Portable schema-9 save/reopen retains accepted stub topology and development.
- **Not in scope:** General dead-end creation/movement/reconnection, disconnected networks (A02), arbitrary branching graphs, new stub-frontage access or automatic frontage parcel generation, protected-road deletion (A04), curve/spline data (A05), custom property re-parceling, global rebuilding of the city or speculative new schema 10.

## 3. Engineering approach to investigate in P1

**Working technical approach to verify in P1: separate the connected *road graph* from the subset of edges that delimit closed parcel/block faces.** A terminal corridor is an accepted graph edge without being a polygon boundary. The geometry engine must still account for its occupied region when deriving block areas, property placement, **existing** access constraints and building clearance—**without granting new frontage along that corridor**. Preserve existing area/face invariants rather than bypassing them.

| Component | Present behavior | Intended change / investigation |
|---|---|---|
| [`src/core/road-graph.js`](https://github.com/xbwtyz/Mappo/blob/main/src/core/road-graph.js) | Degree-one node emits `dangling-junction` | Classify supported terminal ordinary edges; continue rejecting orphan/disconnected/invalid networks |
| [`src/core/road-faces.js`](https://github.com/xbwtyz/Mappo/blob/main/src/core/road-faces.js) | Face traversal requires simple closed loops | Keep terminal branches out of boundary-ring traversal **without losing** graph edges or violating face coverage |
| [`src/core/road-topology-reflow.js`](https://github.com/xbwtyz/Mappo/blob/main/src/core/road-topology-reflow.js) | Maps changed faces/blocks and regenerates eligible development | Prove source→successor faces after deletion; reserve stub corridor and account for changed blocks |
| [`src/core/neighborhood-reflow.js`](https://github.com/xbwtyz/Mappo/blob/main/src/core/neighborhood-reflow.js) | Supports bounded, author-preserving local parcel changes | Refit generated parcels/plots, validate access and setbacks; block unsafe custom cases |
| [`src/editor/road-application.js`](https://github.com/xbwtyz/Mappo/blob/main/src/editor/road-application.js) | Fresh validation and portable round-trip before Apply | Reuse existing transaction authority; do not invent a second Apply validator |
| Road UI and renderer | Draft/impact/status/Apply already exist | Show the retained road and changed/rejected development clearly using existing Roads workspace |

**Architecture alternative to evaluate:** support repeated traversal of bridge edges inside general half-edge face extraction. This may require handling repeated vertices and zero-area walks without breaking simple-ring validators. The preferred separation minimizes such changes *if* the existing road/face/project representation can express the corridor unambiguously. **Do not select the algorithm without a focused source-contract and fixture review.**

## 4. Four approved delivery checkpoints (not implementation authorization)

### 0.2.1-P1 — Reproduction, invariants and topology design

- [ ] Capture a fresh deterministic failing ordinary road deletion and its node/road IDs; the original Issue #79 lacks seed and segment ID.
- [ ] Document the expected graph, original and resulting bounded faces, affected block IDs, corridor geometry and preservation decisions.
- [ ] Confirm valid terminal edge is not an orphan or disconnected network, enumerate protected/crossing negative cases, and explicitly establish that the stub does **not** enable new parcel frontage.
- [ ] Compare the face-traversal vs face-edge-separation approaches and adopt the smallest correct reusable representation.

**Gate:** Focused failing test and non-ambiguous proposed output; no acceptance of an invalid city via skipped checks.

### 0.2.1-P2 — Connected road/face support

- [ ] Implement exact supported terminal-branch graph classification.
- [ ] Keep bounded face extraction deterministic and independent of terminal corridor geometry.
- [ ] Add positive cases for one connected stub and negative cases for isolated roads, orphan nodes, protected boundary branches and invalid crossings.
- [ ] Preserve unchanged graph IDs, road kinds and protected references.

**Gate:** Accepted candidate road graph and bounded faces pass independently. Non-supported topologies still fail with actionable errors.

### 0.2.1-P3 — Corridor clearance and local development reconciliation

- [ ] Reserve retained dead-end road footprint/setback against parcels, plots and buildings **without granting new frontage or generating street-facing lots along it**.
- [ ] Update changed blocks and local generated development with verifiable ancestry; preserve untouched neighborhoods.
- [ ] Preserve user-custom/legacy-unknown parcels and buildings exactly unless an already-supported and independently approved operation applies; otherwise block with clear, locatable reasons. No new automatic authored-data restructuring or silent replacement.
- [ ] Validate street access and plot/building membership with existing project schema 9.

**Gate:** No building or parcel overlaps the retained road, no orphan IDs/ownership, no hidden custom deletion, and no full-city regeneration disguised as local reflow.

### 0.2.1-P4 — User flow, integration and acceptance

- [ ] Preview shows deleted road vs surviving dead-end corridor and neighborhood impacts.
- [ ] Cancel/Reset/invalid decisions leave accepted city/recovery/history unchanged.
- [ ] Apply one validated transaction; Undo and Redo restore precise graph, block, parcel and authored records.
- [ ] Save/reopen the portable project; verify same city with no re-generation and no external runtime network dependency.
- [ ] Full desktop Firefox and Chromium smoke/integration QA, generated Small/Large fixtures and all four morphologies; run targeted performance checks only if reflow paths materially change costs.
- [ ] Compile 0.2.1 standalone with correct version alignment and root/dist byte parity, then full six-runner PR CI and separate owner merge approval.

**Gate:** Complete acceptance report with positive, negative, recovery, cross-editor and browser evidence. No publication without independent release approval.

## 5. Proposed test matrix

| Scenario | Expected outcome |
|---|---|
| Ordinary connected interior stub created by deletion | Preview/Apply succeeds; stub road remains; closed faces valid |
| Generated block/parcel next to stub | Local valid geometry reflows, corridor stays clear |
| Authored building inside candidate corridor | Proposal blocked with specific preservation/placement reason unless existing validated, separately authorized behavior resolves it; no silent loss or new custom redevelopment feature |
| Authored/unknown plot/property metadata | Preserve exactly where supported; otherwise block without mutation |
| Property appears beside an interior dead end | Preserve corridor clearance; **do not** newly qualify dead-end frontage, change plot access entitlement, or auto-generate parcels facing the stub |
| Multiple morphologies: planned, organic, radial, linear | Valid positive/negative outcomes without generating invalid cities |
| Two disconnected components or orphan junction | Remains invalid; A02 separately scoped |
| Protected bridge/bank/boundary/fortification | Ordinary edit remains blocked; A04 separate |
| Undo/Redo; save/reopen; stale preview | Exact accepted-state restoration, no corruption or stale Apply |
| Firefox/Chromium desktop, offline compiled HTML | No JavaScript errors, no network requirement and good map/Inspector feedback |

## 6. Risks, relative effort and remaining technical investigation

**Complexity:** High. This touches invariants shared by roads, face extraction, development placement and persistence. Work should remain modular, with one review-ready PR if checkpoints fit safely; owner may approve splitting if the acceptance scope proves larger.

**Highest risks:** accidentally treating a road corridor as developable face area; breaking exact boundary coverage; silently retiring changed blocks/properties; new junction IDs drifting after Undo; making formerly unsafe road networks pass globally.

**Decided:** D-021-1 **A**, D-021-2 **A**, D-021-3 **A**, D-021-4 **A**. The first-release contract is fixed; see [decision log](DECISION_LOG.md). The architecture may choose implementation techniques only within that contract.

**Remaining P1 investigations (not renewed approval questions):**

1. Which face-extraction representation correctly retains interior terminal roads while preserving positive-area bounded faces, protected geometry and exact coverage?
2. How should the existing project model account for corridor width/setback and open-space quantities **without** changing new-frontage eligibility or assigning unsupported ownership?
3. How does one deterministic seed + removed road ID exercise the complete road → face → parcel → Apply pipeline? Can it be implemented without a new project schema? Any necessary schema change is a **stop-and-seek-approval** gate.

## 7. Approval boundary

The owner has selected Issue #79 as **0.2.1** and approved all four architecture choices (A/A/A/A), plus local planning/document drafting. **The planning docs and Issue #79 specification have been authorized for publication. No application coding, schema migration, CI changes, implementation branch/PR, release or Pages action is authorized by this document.** The [replacement Issue #79 text](ISSUE_79_UPDATE_DRAFT.md) was posted; separately authorize the implementation branch and coding after review of this plan. One PR with four internal checkpoints is the approved delivery shape, but it is **not** a merge or publishing approval.