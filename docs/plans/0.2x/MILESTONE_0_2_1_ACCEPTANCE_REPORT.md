# Mappo 0.2.1 — Dead-End Road Implementation Acceptance Report

> **Issue:** [#79](https://github.com/xbwtyz/Mappo/issues/79) · **PR:** [#111](https://github.com/xbwtyz/Mappo/pull/111) · **Status:** Implementation candidate under CI review; **unmerged and unreleased**. Branch: `feature/mappo-0.2.1-dead-end-roads`. Development application version: `0.2.1-dev`; portable project schema **9**.

## 1. Approved architecture and user-experience change

All owner decisions **D-021-1 through D-021-4 = A** are implemented as the scope contract. Only supported ordinary road **deletion** may create a connected interior dead-end corridor. A terminal road is retained for graph, rendering, persistence, collision and safe clearance, but omitted from the road-edge cycles forming bounded city faces. It provides **no new property frontage or access eligibility**. Changed generated-and-untouched development may be reconciled; authored or unknown-provenance conflicts fail safely. One PR contains P1–P4.

| Behavior | 0.2.0 baseline | 0.2.1-dev candidate |
|---|---|---|
| Delete ordinary segment leaving connected dead end | Blocked by `dangling-junction` | Allowed when bounded faces and development remain valid |
| Block/face topology | Demands each road join a closed face | Distinguishes cycle-bearing faces from ordinary terminal corridors |
| Road clearance | Operation unavailable | Full street width/edge/setback reservation; no parcel overlap |
| New frontage along stub | Operation unavailable | Explicitly not granted |
| User-authored/unknown changes | Protected by refusal | Remain protected; unresolved conflicts continue to refuse Apply |
| Editor Apply and recovery | No accepted candidate | Existing independent validation, one Apply, Undo/Redo, schema-9 save/reopen |

## 2. P1 — Exact baseline reproduction and fixed regression

**Fixed fixture:** `createProject({seed:'c2-radial',size:'small',morphology:'radial'})`. Road deletion `RD-0153` is ordinary secondary street `N-0101 → N-0140`.

On the **actual compiled 0.2.0 baseline**, `draftRoadConnectionC3(..., 'RD-0153', {kind:'remove'})` yields:
- A graph failure with `dangling-junction` at `N-0140`, incident `RD-0154`.
- Reflow blocker `topology-reflow-blocked`: “Junction N-0140 ends without a closed city face.”

On the candidate `0.2.1-dev` standalone, the **same seed and deleted road** produce:
- Two still-connected ordinary terminal edges: `RD-0154` and `RD-0155`.
- Road total **274 → 273**, ordinary blocks **55 → 54**, properties **150 → 150**, buildings **156 → 156**.
- Source blocks `BLK-0023` and `BLK-0034` reconciled to successor block `BLK-X-x9n6tb`, with a stable 17-entry change ledger.
- Accepted graph and extracted faces both valid; face-coverage error approximately `2.91e-11` world-area units (within existing `0.02` tolerance).
- `validateStoredProject` passes on portable schema **9**.

**Repro method:** The comparison used both checked-in standalone HTML build contexts in an isolated Node VM, with application auto-initialization omitted for the core method comparison. The recorded fixture is locked in `tests/dead-end-roads-021.test.js`; it no longer chooses an arbitrary passing road.

## 3. P2 — Graph and bounded-face invariants

- Connected ordinary degree-one terminal branches remain part of the full graph and are recognized by deterministic leaf-chain analysis.
- Bounded-face traversal uses the cycle-bearing subset only, retaining the original exterior ring and exact face-area coverage.
- Disconnected components, orphan junctions, forbidden protected terminal infrastructure and unnormalized crossings retain independent error paths.
- Further terminal-road reconfiguration and introductions through non-deletion operations are explicitly blocked as out of scope.

## 4. P3 — Clearance, frontage and authored data

- The derived terminal corridor reserves half the street width, road edge and mandatory property setback; the fixed secondary-road fixture reserves **6.8 world units** on each side.
- Validation checks polygon boundaries as well as corridor endpoints against complete polygon containment. Generated parcel candidates intersecting the corridor are filtered; parent plot/building ownership must still validate.
- No new frontage road references can identify a terminal corridor.
- Custom-property regression: marking `PROP-00063` as authored with `customName` makes deletion fail with `parcel-decision-required` and preserves the authored record without mutation.
- The existing atomic Apply and project validation remain authoritative; no new bypass or schema migration was introduced.

## 5. P4 — Editor and test matrix

| Case | Evidence / expected result | Status |
|---|---|---|
| `c2-radial`, Small, road `RD-0153` | Fixed regression, 2 terminal roads, valid faces and schema-9 candidate | Manually verified; automated test added |
| `c2-radial`, Large, road `RD-0297` | Valid generated-city deletion and clearance | Manually verified; automated test added |
| `c2-planned`, Large, road `RD-0223` | Valid generated-city deletion and clearance | Manually verified; automated test added |
| `c2-organic`, Large, road `RD-0266` | Valid generated-city deletion and clearance | Manually verified; automated test added |
| `c2-planned`, Small | Example deletion may remain blocked by cross-district ownership | Safe blocker observed |
| Organic/linear Small, `c2-` seeds | No eligible ordinary terminal-deletion fixture in those samples | Not a required positive fixture |
| Custom property on changed block | Blocked, no authored mutation | Manually verified; automated test added |
| Reconnect an existing terminal road | `terminal-edit-out-of-scope` blocker | Manually verified; automated test added |
| Orphan/disconnected/protected corridor | Continues to reject | Automated negative tests added |
| Preview, Apply, Undo, Redo, portable project | Atomic, project and identity round trip | Integration regression added |
| Full Node, Firefox/Chromium browser CI, compiled parity | Required six runners + aggregate gate on exact PR head | **Final verification gate; check PR CI** |

**Build retention:** Versioned `dist/mappo-0.2.1-dev.html` and root `index.html` use identical committed blobs. The older `dist/mappo-0.2.0.html` and other historical builds are retained. There is no release, tag, Pages deploy or main-branch version change.

## 6. Known boundaries and remaining work

This milestone does **not** promise arbitrary dead-end drawing, reconnection or moving an existing terminal road; isolated street networks; protected feature editing; new dead-end frontage; author-driven re-parceling; cross-district mergers; or preservation of an invalid candidate. A proposed deletion can still be blocked when district ownership, generated content or custom identity cannot be reconciled safely.

**Acceptance remains conditional on passing the exact-head PR test matrix and owner review.** A successful PR CI run is not authorization to merge or publish a stable release.

[Detailed milestone](MILESTONE_0_2_1_DEAD_END_ROADS.md) · [0.2.x roadmap](ROADMAP_0_2X.md) · [Issue #79](https://github.com/xbwtyz/Mappo/issues/79)
