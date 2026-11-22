# Mappo 0.2.2 — Coincident Ordinary Junction Normalization: Acceptance Report

> **Issue:** [#95](https://github.com/xbwtyz/Mappo/issues/95) · **PR:** [#112](https://github.com/xbwtyz/Mappo/pull/112) · **Status:** Implementation candidate; required CI and review evidence tracked on PR. **Not merged or released.** Development label `0.2.2-dev`; project schema **9**.

## 1. Owner-approved scope and user experience

The approved decisions **D-022-1 through D-022-4 = A/A/A/A** authorize exact ordinary endpoint co-location and supported multiple contacts, without near-snapping, nonzero collinear interior overlap, automatic authored identity rewriting or Issue #98 topology-budget expansion. No new user-facing dialog or walkthrough is introduced.

| User workflow | Before (`0.2.1-dev`) | Proposed after (`0.2.2-dev`) |
|---|---|---|
| Precisely move an ordinary road junction onto another eligible junction | Rejected: two existing corners coincide | Junction identities can be consolidated when unambiguous, then face/parcel reflow independently validates the result |
| Three or more roads meet where a road already ends | Some event ordering is rejected | Interior cuts are rebound to the accepted junction at the same coordinate |
| Overlapping collinear road interiors | Rejected | **Still rejected** (deliberate scope limit) |
| Protected feature or custom/opaque junction identity | Blocked | **Still blocked** rather than silently rewritten |
| Edit recovery and offline file | No valid candidate for newly eligible cases | Existing Apply, Undo/Redo and portable schema-9 validation remain authoritative |

## 2. P1 — Locked deterministic reproduction

**Fixture:** `createProject({seed:'c2-planned',size:'small',morphology:'planned'})`, move `N-0139` to the exact coordinates of `N-0140`.

On actual compiled `0.2.1-dev` code, `prepareJunctionReflowC7` returns `topology-reflow-blocked`: **"Two existing corners coincide. Offset the street to create a distinct junction."** The first `prepareJunctionIntentC7` produces six `unnormalized-crossing` reports.

The revised normalizer produces a valid candidate graph. A local engine-level smoke test recorded **157 → 156 road nodes** and **35 entries** in its changed-item ledger. The result retains unaffected road identities and passes the existing local reconciliation pipeline. These observations are preliminary local VM verification, not a substitute for the GitHub CI results below.

## 3. P2 — Deterministic graph normalization

- Analyze exactly coincident endpoints as a *detached candidate*, never mutate the accepted city.
- Keep the lexically stable surviving ordinary junction ID; reroute attached ordinary roads while preserving their metadata and IDs.
- Refuse collisions that would cause a self-loop, duplicate edge, protected road or protected-face ownership rewrite, or would discard unknown/authored junction metadata.
- Handle multiple independent cuts at one crossing point using an existing accepted endpoint where present; refuse inconsistent conflicting endpoints.
- Keep ordinary T/X normalization, the existing crossing-count and work limits, protected validation, and collinear overlap refusal.

## 4. P3 — Faces, ownership, frontage and preservation

The change deliberately reuses `extractRoadFaces`, `matchExistingFaces`, `prepareRoadTopologyReflowC3`, `validateStoredProject` and the independent Apply flow. New graph validity is **not** sufficient by itself for acceptance: invalid face ownership, parcel clearance, protected infrastructure, custom metadata and unsafe cross-district lineage still block the change.

The 0.2.1 dead-end road corridor protection is unaffected. No schema migration, new API access contract or unbounded global regeneration is added.

## 5. P4 — Tests and final gates

The new `tests/road-intersections-022.test.js` covers:

- Fixed endpoint-endpoint and multi-contact graph fixtures; record/endpoint direction invariance.
- Previously failing generated Planned-city co-location and full candidate/project validity.
- Protected infrastructure, protected faces, opaque authored metadata, duplicate edges and collinear interior overlap negatives.
- Existing ordinary crossing regression; isolated project immutability.
- Standalone Roads workspace Apply/Undo/Redo and schema-9 portable round trip.

**CI status:** The exact-head PR run, checked-in compiled standalone parity, and the final six-runner result must be filled with verified GitHub results before review approval. A green test matrix is not permission to merge or publish a release.

## 6. Known limitations and subsequent issue

- **No near-point snapping**; only exact coincident accepted coordinates qualify.
- **No collinear overlapping street interiors**; these remain rejected.
- Protected, unknown-provenance, or conflicting IDs still block; no automatic identity deletion/reparenting of authored content.
- Cross-district and complex multi-block ownership cases remain conservative.
- The separate [Issue #98](https://github.com/xbwtyz/Mappo/issues/98) concerns wider topology reflow and the current 32-affected-block limit; it is not included in PR #112.
- No stable `0.2.2` GitHub Release, tag, Pages deployment or `main` merge has been authorized.

[Detailed 0.2.2 plan](MILESTONE_0_2_2_INTERSECTION_NORMALIZATION.md) · [0.2.x roadmap](ROADMAP_0_2X.md) · [Issue #95](https://github.com/xbwtyz/Mappo/issues/95)
