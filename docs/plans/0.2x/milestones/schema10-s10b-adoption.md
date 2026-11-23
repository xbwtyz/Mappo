# Schema 10 — S10-B Authoritative Geometry Adoption and Migration

**Status:** P1–P5 are implemented in [PR #132](https://github.com/xbwtyz/Mappo/pull/132). Full [implementation-head CI #45129335716](https://github.com/xbwtyz/Mappo/actions/runs/45129335716) passed at `4a1dcc76f2e5db4e81097250e22873765c405c50` (574 Node tests, all four desktop-browser suites and the aggregate gate; 6m 18s). **Owner review and separate merge approval remain pending. Not merged or released.** No tag or Pages authorization. Subsequent commits require new exact-head CI verification.

**Base:** main 1578e3c0a7f504d6510414a419b9374d4b9227ff, app 0.2.14-dev, project schema 9; full post-merge CI green.

## Invariants and acceptance boundaries

- The accepted **2D city** is authoritative; no second editable representation.
- Schema 10 building records persist `geometry:{version:1,regions:[...]}` and `components:[...]` only; any flat `footprint` and `holes` access must be a safely derived read-only projection.
- Outer geometry, courtyard voids, component tree, building IDs, independent property ownership, and optional property-owned compounds are separate relationships. A courtyard occupant does not become owned by its enclosing building.
- Migration from Schema 9 does not run generation, recompute a city, remove unknown metadata or change roads, plots, entrances, access paths, historical IDs, accepted history, or workspace state.
- Schema 10 -> Schema 9 writes, flattening non-simple topology, and unknown-field overwrites are forbidden. Portable envelope and workspace versions remain 1.
- Existing editor and generator operations on simple buildings must be converted to canonical changes atomically and verified before Apply. Unsupported complex structures fail closed until later milestones.
- Preserve existing Firefox/Chromium desktop, standalone HTML, offline, deterministic and recovery guarantees.

## Approved P1–P5 implementation checkpoints

| Gate | Implementation | Acceptance |
|---|---|---|
| P1 | Pure lossless Schema 9 -> 10 building and project migration; reject collisions | Determinism, metadata/ID/geometry fidelity, nonmutation, invalid-input rejection |
| P2 | Adopt Schema 10 in core validation, generation, collision/plot occupancy, and rendering | One authoritative geometry, correct nested region parity and preserved legacy city behavior |
| P3 | Integrate existing building/compound/road/property editors through safe projections and canonical edit adapters | Preserve identities and access, prevent stale/unsupported edits, atomic Apply/Undo |
| P4 | Integrate save/load, versioned migration, recovery, history and current workspace | Schema 9 fixture upgrades, safe unsupported schemas, project/envelope/workspace independence |
| P5 | Comprehensive targeted and negative tests, Firefox/Chromium standalone browser QA and exact-head full CI | Six required runner suites + aggregate, deterministic compiled root/dist parity, owner review PR |

## Deferred scope

S10-C nested building access and portals (#122); S10-D component-authoring controls; S10-E Boolean unions (#121); S10-F stabilization beyond migration. None is implicitly authorized by S10-B.

## Implementation review and verification status

- **P1:** Pure Schema 9 to 10 conversion is implemented with deterministic geometry/component IDs, authored building identity retention, metadata protection, explicit collision rejection, and untouched unrelated city/workspace structures.
- **P2:** Canonical geometry records are adopted in generation, topology validation, occupied-area/plot calculations, collision detection, rendering and selection, including disconnected solid roots and nested solid/void islands.
- **P3:** Existing simple-building, compound, parcel and road workflows use derived read-only views and canonical, validated Apply transactions. Unsupported complex editing remains explicitly deferred.
- **P4:** Portable envelope version 1 and workspace schema version 1 remain independent. Historical save migration, recovery, Undo/Redo, provenance and accepted history are regression-covered.
- **P5:** Targeted S10-A/S10-B and negative regression coverage is implemented. [Full CI #45129335716](https://github.com/xbwtyz/Mappo/actions/runs/45129335716) passed at implementation head `4a1dcc76` with **574 Node tests passed, 0 failed** (261 + 313), four desktop browser QA suites passed, and the aggregate gate passed (**6m 18s**). The earlier source-formatting/build-parity discrepancy was corrected; root `index.html` and `dist/mappo-0.2.14-dev.html` are byte-identical (**1,981,925 bytes**). This is automated verification, not hands-on owner UX signoff; subsequent commits require exact-head revalidation.

### User-experience delta

Schema 9 edits previously relied on persistent flat `footprint` and `holes`. Schema 10 preserves existing simple-building editing behavior but stores only canonical regions and components. Users do not yet receive S10-C portals/nested occupancy editing, S10-D component editing, or S10-E unions. The foundation now supports future behavior without implicitly assigning ownership through courtyard containment.

### Merge gate

Keep the dedicated feature branch until the **current** PR head passes both Node shards, all four desktop-browser suites, standalone byte parity, and the aggregate gate. The implementation head above passed; this documentation correction also requires a new exact-head check. **Separate owner approval is mandatory for merging**, and merge approval does not authorize tagging, publishing a release, or deploying Pages.
