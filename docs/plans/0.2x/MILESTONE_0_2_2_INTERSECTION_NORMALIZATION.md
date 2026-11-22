# Mappo 0.2.2 — Intersection Normalization (A03, Issue #95)

**Status:** Owner-approved design D-022-1..4=A/A/A/A; implementation authorized on feature branch.  
**Source baseline:** Mappo `main` `6aad30a080593dde78f981601b90afaf4b6233b1`, development build `0.2.1-dev`; project schema 9.  
**Prior milestone:** A01 / Issue #79 merged in PR #111, with stable 0.2.1 release not yet published.  
**Later dependency:** A06 / Issue #98 remains separate and may follow once intersection semantics are stable.

## 1. User problem and intended outcome

The current road editor can normalize ordinary interior crossings and some endpoint-on-segment T junctions. It cannot safely reconcile *two pre-existing different junction IDs at the same location*, and it rejects some multiple-contact and collinear arrangements.

A user should be able to make a physically sensible ordinary road connection without receiving an arbitrary-looking topology error, **provided that** junction identity, road identity, ownership, protected features and adjacent properties can all be reconciled safely.

This is a **feature expansion of accepted topology**, not permission to ignore current graph validation.

## 2. Confirmed source constraints

- `src/core/road-crossings.js`: `normalizeRoadCrossingsC3` handles simple noncollinear contacts by splitting edges; explicitly rejects `endR && endS` (coincident existing endpoints) and `existing && (endR || endS)` (multiple contacts sharing an existing junction). It refuses parallel/collinear contact and caps crossings at 24.
- `src/core/road-graph.js`: rejects `unnormalized-crossing`, `overlapping-roads`, duplicate edges, orphan nodes and disconnected components.
- `src/core/road-topology-reflow.js`: maps accepted faces to their successors; refuses mixed district/usage groups and unsupported lineage; currently caps reflow at 32 affected blocks. These are the *separate* A06 concerns.
- `src/core/road-faces.js`: closed-face extraction, protected feature ownership, exact boundary coverage and deterministic face matching still govern every candidate.
- `src/data/project-validation.js` and `src/editor/road-application.js`: stored-project validation, fresh independent Apply and portable round-trip may not be bypassed.

**Important:** Plain T-junction splitting and ordinary X crossings already have positive tests. Do not reimplement these or claim them as new features.

## 3. Proposed decisions (not yet approved)

| ID | Question | A — Recommended | B | C |
|---|---|---|---|---|
| D-022-1 | First crossing class | Safely consolidate **exactly coincident ordinary junction endpoints**, including eligible multi-contact at that coordinate | Also normalize near-coincident junctions via geometry movement | All crossing/overlap classes in one milestone |
| D-022-2 | Collinear contacts | Allow only proven **zero-length contact** with no interior shared street length; reject partial/full overlap | Normalize certain overlapping ordinary segments by splitting and deduplicating | Allow all parallel/overlapping road networks |
| D-022-3 | Identity and authorship | Prefer unchanged accepted junction/road IDs where continuation is provable; block conflicts with authored/opaque references instead of silently choosing a survivor | Introduce explicit user-directed reparenting/re-identification as part of this milestone | Rewrite all affected IDs and dependencies automatically |
| D-022-4 | Delivery boundaries | One PR for A03; keep A06 separately scoped, with its own approval after A03 | One consolidated A03+A06 PR | Multiple PRs per crossing subtype |

**Recommendation:** A / A / A / A. No schema-9 additions and no new intersection editing UI unless necessary for meaningful blockers.

## 4. Architecture approach

1. **Classify** contacts before normalizing: clean crossing, endpoint-on-segment, endpoint-endpoint, collinear touch, collinear interior overlap, protected contact, duplicate-edge and unsupported ambiguity. Build a typed diagnostic instead of treating every contact as one generic crossing.
2. **Normalize only approved classes** in a detached draft. Use existing graph and geometric helpers; avoid a parallel authoritative road engine.
3. **Select identity deterministically:** preserve existing IDs where possible, keep unaffected metadata byte-semantically identical, and emit an auditable old-to-new lineage for any endpoint/road split. Where two accepted entities carry incompatible identity/ownership, **block** rather than implicitly delete an authored entity.
4. **Revalidate** with the established `buildRoadGraph` → `extractRoadFaces` → `matchExistingFaces` → neighborhood reconciliation → `validateStoredProject` chain. Continue to reserve terminal corridors per A01 and reject protected/unsupported connections.
5. **Apply atomically** through the existing road workspace and fresh validation, with exact Undo/Redo, safe Cancel/Reset and schema-9 save/reopen.

Potential technical complication: consolidating two distinct accepted nodes might invalidate attached custom references even if their coordinates coincide. This is an explicit conflict, **not** justification for deleting a node or its metadata silently.

## 5. Four checkpoints

### P1 — Fixed reproduction, taxonomy and baseline

- [ ] Capture a deterministic seed, road edit, nodes/roads and exact rejection for at least one endpoint-endpoint contact and one multi-contact existing-junction case.
- [ ] Distinguish these from already-supported T and X scenarios.
- [ ] Add cases for disallowed collinear overlap, protected crossing, orphan/disconnected graph and authored identity conflict.
- [ ] Record before/after expected road and junction membership, face lineage and preserved metadata.

**Gate:** Every proposed positive case has a defined expected valid planar topology, not only a desire to suppress an error.

### P2 — Narrow normalization and deterministic identity

- [ ] Implement classification and supported endpoint consolidation with bounded work.
- [ ] Preserve existing road metadata and safe node identities; reject ambiguous or protected reidentification.
- [ ] Ensure both original record order and endpoint direction produce the same accepted normalized result.
- [ ] Keep collinear overlaps rejected under recommended option A.

**Gate:** Graph-valid results with zero missing/duplicate edges and complete before-to-after lineage.

### P3 — Faces, development and preservation

- [ ] Face extraction yields valid positive-area rings and exact coverage after normalization.
- [ ] Existing unaffected blocks, authored properties/buildings, access and metadata retain identity.
- [ ] Any mixed-district or irreconcilable parcel result remains blocked (A06 is a separate design).
- [ ] Terminal corridors from A01 retain clearance and no-frontage guarantees.

**Gate:** Whole-city/project validator and portable save succeed; invalid candidates remain non-mutating.

### P4 — Editor integration, test matrix and review

- [ ] Roads workspace previews eligible junction consolidation with understandable impact/report and blockers.
- [ ] Cancel/Reset and stale drafts are non-destructive; Apply is independent and atomic.
- [ ] Undo/Redo restores exact original node/road/parcel memberships.
- [ ] Run focused Node tests for accepted/rejected crossings and full six-runner CI (two Node, four browser suites), browser offline smoke and root/dist parity.
- [ ] Publish a before/after UX report, deterministic fixture evidence and known unsupported cases.
- [ ] Open one PR; **do not merge, tag, release or deploy Pages without separate approval**.

**Gate:** All required exact-head CI green and owner review of the PR.

## 6. Acceptance matrix

| Case | Expected result |
|---|---|
| Two ordinary road endpoints already at the same coordinate, no conflicting ownership | Resolve to one legal junction with deterministic IDs |
| Several ordinary contacts sharing a supported point | One shared junction, correctly split/connected road edges |
| Existing ordinary T- and X-crossing cases | Continue to pass without change in behavior |
| Two collinear roads touching only at an endpoint | Normalize only if the chosen topology/identity contract proves safe |
| Roads with nonzero collinear overlap | Reject in 0.2.2 under option A; reserve broader overlap work for future scope |
| Protected bridge, coast, plaza, pass or boundary contact | Reject without damaging protected feature |
| Conflicting authored junction/road metadata or unknown references | Block with affected record IDs; no implicit deletion |
| Unresolved cross-district lineage | Block explicitly; A06 remains open |
| Same edit with reversed record order | Deterministic candidate graph, IDs and issue ledger |
| Offline standalone/Undo/Redo/save | Full project round trip; no unexpected changes to accepted city |

## 7. Risk, complexity, and out of scope

**Complexity:** High (graph identities, planar normalization, closed faces, road/parcel dependencies).  
**Primary risks:** merging two separately owned IDs; creating duplicate or zero-length edges; altered protected boundaries; incorrectly creating extra block faces; breaking existing A01 dead-end behavior.

**Out of scope:** overlapping collinear *interiors* (unless separately approved), protected-road editing, disconnected street networks, increasing A06 block budgets, mixed-district authoring decisions, schema 10, 3D exports, UI redesign, releases or Pages.

## 8. Permission and next action

This proposal is read-only design work. Owner approved D-022-1 through D-022-4 and authorized the focused 0.2.2 implementation. PR merge and release remain separate approval gates. A03 should precede A06; once A03's behavior is validated, review Issue #98 with actual reproducible blocked examples rather than relaxing the 32-block safeguard speculatively.

**Source:** [Issue #95](https://github.com/xbwtyz/Mappo/issues/95) · [Issue #98](https://github.com/xbwtyz/Mappo/issues/98) · [0.2.x Roadmap](https://github.com/xbwtyz/Mappo/blob/main/docs/plans/0.2x/ROADMAP_0_2X.md) · [PR #111](https://github.com/xbwtyz/Mappo/pull/111)

## P1 verified fixture (implementation)

Baseline `0.2.1-dev` from merged PR #111: Small Planned `c2-planned`, move existing junction `N-0139` precisely to `N-0140` coordinates. Baseline returns `topology-reflow-blocked`: “Two existing corners coincide. Offset the street to create a distinct junction.” The candidate junction normalizer produces a valid graph, with nodes 157 → 156 and 35 change-ledger entries. This is a source/VM engine-level reproduction; end-to-end CI verification is tracked by the feature PR.


## J1–J4 — Junction targeting and mouse-driven merge (owner-approved extension)

**Owner decision:** On the existing PR #112 and branch; snap enabled by default; 12px capture / 18px sticky-release hysteresis; Alt disables snap during drag; select source by map click, select target by map click, then Review and Apply. For explicit source→target merges preserve the selected **target ID** when safe. No version increment beyond `0.2.2-dev`, new schema or separate PR.

### User experience
- Dragging an ordinary junction close to another eligible ordinary junction snaps its proposed X/Y exactly to the accepted target coordinates, independent of map zoom; the target gets a visible marker/label.
- Hold **Alt** during dragging to bypass snapping. The checkbox defaults ON and can disable it entirely. Numeric X/Y input and road/bend operations remain manual.
- **Connect / Merge Junctions** enters a two-click map-selection mode: click source, then destination. An on-map highlight and panel status show selection and expected target; preview is still non-destructive, and normal **Review impacts → Apply road edit** commits if independently validated.
- **Cancel connection** or Escape abandons the two-click mode before exiting the Roads workspace. Zoom, pan, and editor selection retain existing behavior.
- For explicit snap/pair selection, the *target* junction survives by ID. A redundant/zero-length road, ambiguous authored reference, protected target, disconnected network or unsafe district/development adaptation continues to block Apply.

**J3 regression note:** A canonical positive mouse-pick fixture is Small Planned `c2-planned`, **source `N-0140` → target `N-0139`**. The reverse direction attempts to combine blocks of different districts/usages and remains blocked with `district-decision-required`; no target-ID preference bypasses this architectural safety boundary. An independent synthetic ordinary graph verifies explicit preference for a lexicographically later target when safe.

### Implementation
- `src/core/junction-targeting.js`: pure world-to-screen-distance hit calculation (12px capture, 18px release, stable deterministic ties), guarded by existing ordinary junction eligibility.
- `src/editor/road-preview.js`: transient snap state, Alt bypass, bounded click-to-pick state and existing reflow invocation. No new mutation path.
- `src/ui/road-inspection.js` and `index.template.html`: compact checkbox, Connect/Merge button, cancel action, and source/target instructions.
- `src/ui/controllers.js` and `src/app.js`: pass live pointer modifier state to snap handler; reserve map clicks for the merge tool; Escape cancels selection; worker Apply includes the selected target identity.
- `src/renderer/road-inspection.js`: preview-only markers for snap, source, hover, destination.
- `src/core/road-crossings.js`, `road-topology-reflow.js`, `neighborhood-reflow.js`, `src/worker/junction-preview-worker.js` and `src/editor/road-application.js`: preserve target identity by explicit validated preference across preview and authoritative Apply. Standard non-merge normalization retains the previous deterministic identity behavior.

### Review acceptance — must pass before merge
- [ ] J1: zoom-aware capture, hysteresis and deterministic targeting, exclude protected/self.
- [ ] J2: normal drag, snap, Alt bypass, snap disabled and drag cancellation.
- [ ] J3: two-click selection without accidental movement, visible labels, target identity through sync and worker reflow, authored conflicts guarded.
- [ ] J4: editor preview, independent Apply, Undo/Redo, Cancel/Escape, schema-9 portable save, offline Firefox/Chromium.
- [ ] Official generated standalone `index.html` equals versioned `dist/mappo-0.2.2-dev.html`; historical builds retained.
- [ ] All six CI runners and required aggregate check green on the final head; provide exact run link and duration.
- [ ] Separate explicit owner approval before PR merge; no release or Pages publication.

**Scope not added:** automatic nearby junction movement outside dragging, near-coincident merging without exact snap, arbitrary collinear overlaps, freehand line drawing, protected-road reparenting, or Issue #98 large reflow.
