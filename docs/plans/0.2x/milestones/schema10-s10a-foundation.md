# Schema 10 — S10-A Canonical Structural Geometry Foundation

**Status:** S10-A owner-authorized implementation candidate. S10-B, project schema 10 adoption, migration, nested-building editor, Boolean unions, merges, release, tags and Pages are **not authorized** by this milestone.

**Base:** verified `main` `847a24880d78dd9dab84ae47b4e9ba84d9d6b247` (app `0.2.14-dev`, project schema **9**, portable envelope **1**, workspace schema **1**).

## Problem and intended outcome

Schema 9 owns building geometry as `footprint + holes`. This correctly supports one exterior and flat courtyards but cannot represent nested islands or multiple solid roots. The owner approved D-10-1–10=A: canonical solid/void regions, separate structural components, independent courtyard buildings with unchanged ownership semantics, an eventual geometry kernel, a deliberate schema 9→10 migration, and sequential approval gates.

**S10-A adds only pure geometry facilities and tests.** Runtime readers, renderers, editor sessions, generator, project persistence and existing history continue to use **schema 9**. No dual-writable representation is introduced; generated standalone HTML remains unchanged.

## Module contract (not a persisted schema yet)

- `src/core/building-topology-s10.js`: `canonicalizeBuildingRegionsS10`, `regionDepthS10`, `createS10GeometryBudget`, `pointOnS10Ring`.
- `src/core/building-components-s10.js`: `canonicalizeBuildingComponentsS10`, `validateBuildingStructureS10`.
- `src/core/building-occupancy-s10.js`: `occupiedAreaS10`, `pointOccupancyS10`, `occupiedPlotAreaS10`, `occupiedIntersectionAreaS10`, `occupiedRegionsOverlapS10`, `polygonIntersectionAreaS10`.
- `src/core/building-geometry-adapter-s10.js`: `legacyBuildingShapeToS10`, `projectSimpleBuildingS10`, `reserveBuildingPartIdS10`.

Canonical geometry `{version:1,regions:[...]}`, with each region:
- `{id,kind:'solid'|'void',parentId,ring}` and a required `componentId` on **solid** regions only.
- `parentId:null` denotes a root; all roots are solid.
- Children alternate solid/void, are strictly contained in their parent, and cannot touch its boundary.
- Sibling rings, including distinct roots, are pairwise disjoint without contact/overlap/containment.
- All rings are CCW, finite, simple, 3–1024 points. Normalization copies and reverses a clockwise input without changing its coordinates; region IDs remain unchanged.
- Unknown compatible region keys are carried through canonicalization as copied values; no accepted project records are mutated.

Components are a different tree, `[{id,parentId,name?}]`, with exactly one root, unique building-scoped IDs, valid parentage, and no cycles. Every solid region references one component; no component owns an independent building. Existing schema-9 compound membership does not become component membership.

**Deterministic canonical order:** parent-before-child, siblings sorted by stable ID. Stable IDs cannot be regenerated from mutable array indices. The scoped allocator selects the first unused `REG-MAN-000001` or `BC-MAN-000001` style identifier; ID assignment for *migrated* legacy courtyards is handled by the separate pure adapter using `REG-H0001` etc.

**Bounded work:** 128 regions, 64 components, eight total nesting levels, 1,024 vertices per ring, a per-query default work counter capped at 6,000,000. Numeric contact and ear clipping are intentionally fail-closed for ambiguous/sliver geometry. These are **provisional** implementation safety bounds, not measured release performance limits; S10-B may only revise them after evidence and approval.

## Occupancy contract

The authoritative occupied indicator is the signed sum of disjoint nested rings. The net area equals solid region areas minus void region areas. For intersections and plot coverage, the pure implementation triangulates valid simple CCW rings and clips convex triangles, summing signed pairwise area contributions. It does **not** approximate occupancy using bounding rectangles or assume every ring is convex.

- `pointOccupancyS10` returns `solid`, `void`, `outside`, or `boundary` to avoid treating a numerically ambiguous contact as a valid corridor.
- `occupiedIntersectionAreaS10` measures actual positive-area overlap, so an **independent building** entirely inside an enclosing building's courtyard void does not collide with the enclosing occupied region. A building crossing the enclosing wall does collide.
- `occupiedPlotAreaS10` accounts for holes and islands with signed intersections and is a candidate for later plot-ownership integration; **S10-A does not change project validation**.
- Positive-area interior overlap is a collision; touching between separately owned buildings is not an occupied-area collision. Touching within one region hierarchy is rejected by the topology contract.

## Legacy adapter boundary

`legacyBuildingShapeToS10` verifies existing `footprint + holes` using the existing F1 validator, then returns a detached one-root geometry with void children and one root component. It refuses pre-existing `geometry` or `components` keys, rather than overwriting unknown compatible metadata. This is *not* a project migration; metadata storage and migration collision policy remain S10-B responsibilities.

`projectSimpleBuildingS10` returns a detached `{ok:true,footprint,holes,area}` **only** when geometry is representable by one solid root, flat void children and one component. On invalid or complex shapes it returns `{ok:false,code,reason}`; a legacy editor must never flatten away nested regions, extra roots or components.

## P1–P5 implementation checkpoints

| Checkpoint | Scope | Acceptance |
|---|---|---|
| P1 | Stable data contract, identity, limits and fixture examples | Deterministic order and validation; input immutability |
| P2 | Region nesting, cycle/contact/overlap protection | Positive and adversarial topology tests |
| P3 | Area, point occupancy, concavity, polygon intersections, plot overlaps | Exact fixture expectations and nested courtyard collision avoidance |
| P4 | Separate component tree, scoped IDs, non-lossy legacy adapters | Existing generated schema-9 city equivalence and explicit unsupported topology |
| P5 | Negative tests, build/CI checks, publication boundaries | Required Node shards, four browser suites, aggregate, exact-head CI; compiled root/dist parity |

**Primary test file:** `tests/building-geometry-s10a.test.js`. Covers canonicalization, nested parity, independent courtyard collision, concave triangle intersections, plot attribution, 64 legacy holes, components, nonmutation, budgets, deterministic IDs, and legacy editor-adapter refusal.

## Exclusions and next gates

S10-A does **not**:
- Increment `PROJECT_SCHEMA_VERSION` or change any save/migration/recovery file.
- Author nested regions in the UI or accept inaccessible enclosed courtyard buildings.
- Change existing city generators, accepted editor data, rendering, property/road work or history.
- Implement arbitrary Boolean unions/intersections/differences or cross-property ownership.
- Change production runtime dependencies, app version, CI selection, mobile targets or C7 benchmark policy.

The next step, **S10-B**, requires separate coding authorization after S10-A PR merge. It will migrate authoritative project records, validate unknown metadata collisions, update all authoring/rendering/plot/access/history paths, and independently verify portable roundtrips. S10-C enables enclosed courtyard occupants only with a validated access topology.

**Merge and publication boundary:** S10-A requires full exact-head CI and explicit owner merge approval. Merge does not authorize release, tag, or Pages deployment.
