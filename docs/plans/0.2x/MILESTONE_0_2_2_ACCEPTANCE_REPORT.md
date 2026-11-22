# Mappo 0.2.2 — Coincident Ordinary Junction Normalization: Acceptance Report

> **Issue:** [#95](https://github.com/xbwtyz/Mappo/issues/95) · **PR:** [#112](https://github.com/xbwtyz/Mappo/pull/112) · **Status:** Implementation candidate; required CI and review evidence tracked on PR. **Not merged or released.** Development label `0.2.2-dev`; project schema **9**.

## 1. Owner-approved scope and user experience

The approved decisions **D-022-1 through D-022-4 = A/A/A/A** authorize exact ordinary endpoint co-location and supported multiple contacts. The separately approved **J1–J4** extension adds magnetic drag-to-junction snapping and explicit two-click Connect / Merge; it does **not** permit automatic proximity-based merges, collinear interior overlap, arbitrary authored identity rewriting or Issue #98 topology-budget expansion. No new mandatory dialog or walkthrough is introduced. Preview and independent Apply remain required.

| User workflow | Before (`0.2.1-dev`) | Proposed after (`0.2.2-dev`) |
|---|---|---|
| Precisely move an ordinary road junction onto another eligible junction | Rejected: two existing corners coincide | Junction identities can be consolidated when unambiguous, then face/parcel reflow independently validates the result |
| Three or more roads meet where a road already ends | Some event ordering is rejected | Interior cuts are rebound to the accepted junction at the same coordinate |
| Drag toward an existing ordinary junction | Required manual entry of exact X/Y | Snap ON by default within 12px; retain snapped target until 18px; Alt bypass or OFF toggle |
| Connect/merge by map clicks | No dedicated action | Click source, click target, then review impact and Apply; target ID retained when safe |
| Overlapping collinear road interiors | Rejected | **Still rejected** (deliberate scope limit) |
| Protected feature or custom/opaque junction identity | Blocked | **Still blocked** rather than silently rewritten |
| Edit recovery and offline file | No valid candidate for newly eligible cases | Existing Apply, Undo/Redo and portable schema-9 validation remain authoritative |

## 2. P1 — Locked deterministic reproduction

**Fixture:** `createProject({seed:'c2-planned',size:'small',morphology:'planned'})`, move `N-0139` to the exact coordinates of `N-0140`.

On actual compiled `0.2.1-dev` code, `prepareJunctionReflowC7` returns `topology-reflow-blocked`: **"Two existing corners coincide. Offset the street to create a distinct junction."** The first `prepareJunctionIntentC7` produces six `unnormalized-crossing` reports.

The revised normalizer produces a valid candidate graph. A local engine-level smoke test recorded **157 → 156 road nodes** and **35 entries** in its changed-item ledger. The result retains unaffected road identities and passes the existing local reconciliation pipeline. These observations are preliminary local VM verification, not a substitute for the GitHub CI results below.

## 3. P2 — Deterministic graph normalization

- Analyze exactly coincident endpoints as a *detached candidate*, never mutate the accepted city.
- Default identity remains lexically deterministic for ordinary normalization. **Explicit click-to-merge or snapped drag prefers the selected destination junction ID** when the entire resulting city validates; do not rewrite unsafe cross-district/opaque records.
- Refuse collisions that would cause a self-loop, duplicate edge, protected road or protected-face ownership rewrite, or would discard unknown/authored junction metadata.
- Handle multiple independent cuts at one crossing point using an existing accepted endpoint where present; refuse inconsistent conflicting endpoints.
- Keep ordinary T/X normalization, the existing crossing-count and work limits, protected validation, and collinear overlap refusal.

## 4. P3 — Faces, ownership, frontage and preservation

The change deliberately reuses `extractRoadFaces`, `matchExistingFaces`, `prepareRoadTopologyReflowC3`, `validateStoredProject` and the independent Apply flow. New graph validity is **not** sufficient by itself for acceptance: invalid face ownership, parcel clearance, protected infrastructure, custom metadata and unsafe cross-district lineage still block the change.

The 0.2.1 dead-end road corridor protection is unaffected. No schema migration, new API access contract or unbounded global regeneration is added.

## 5. P4 — Tests and final gates

The original `tests/road-intersections-022.test.js` covers:

- Fixed endpoint-endpoint and multi-contact graph fixtures; record/endpoint direction invariance.
- Previously failing generated Planned-city co-location and full candidate/project validity.
- Protected infrastructure, protected faces, opaque authored metadata, duplicate edges and collinear interior overlap negatives.
- Existing ordinary crossing regression; isolated project immutability.
- Standalone Roads workspace Apply/Undo/Redo and schema-9 portable round trip.

### J1–J4 expanded acceptance

- `tests/junction-snap-merge-022.test.js`: source/target identity, 12px capture and 18px hysteresis across zoom levels, Alt bypass, snap-off, deterministic choices, protected/invalid targets, mouse pick and Cancel, atomic Apply/Undo/Redo, and safe cross-district blocker.
- `scripts/junction-snap-merge-browser-qa.mjs`: actual Chromium and Firefox pointer events and map clicks, target identity, Alt, preview, Apply and history; invoked as part of the unchanged six-runner CI's roads browser suite.
- **Positive explicit-target fixture:** Small Planned `c2-planned`, move `N-0140` to `N-0139`; target `N-0139` survives. Reverse `N-0139` → `N-0140` remains intentionally blocked with `district-decision-required`, demonstrating that explicit targeting cannot override unsafe ownership.
- `index.html` and `dist/mappo-0.2.2-dev.html` now contain the same exact official CI-built blob `7854388` (from [run #44978314847](https://github.com/xbwtyz/Mappo/actions/runs/44978314847)); published historical versions are retained.
- **Pending final gate:** [PR full CI run #44978570784](https://github.com/xbwtyz/Mappo/actions/runs/44978570784) on head `091d646`, with the new browser script and checked-in standalone. Record the final outcome and measured duration in the PR before owner merge review.

A successful test matrix is **not** permission to merge, tag, publish a stable release, or deploy Pages.

## 6. Known limitations and subsequent issue

- Snap targeting requires an explicit junction drag within a screen-space radius, or a two-click Connect / Merge selection; **there is no automatic merge of nearby cities/road nodes without a user action**.
- **No collinear overlapping street interiors**; these remain rejected.
- Protected, unknown-provenance, or conflicting IDs still block; no automatic identity deletion/reparenting of authored content.
- Cross-district and complex multi-block ownership cases remain conservative.
- The separate [Issue #98](https://github.com/xbwtyz/Mappo/issues/98) concerns wider topology reflow and the current 32-affected-block limit; it is not included in PR #112.
- No stable `0.2.2` GitHub Release, tag, Pages deployment or `main` merge has been authorized.

[Detailed 0.2.2 plan](MILESTONE_0_2_2_INTERSECTION_NORMALIZATION.md) · [0.2.x roadmap](ROADMAP_0_2X.md) · [Issue #95](https://github.com/xbwtyz/Mappo/issues/95)
