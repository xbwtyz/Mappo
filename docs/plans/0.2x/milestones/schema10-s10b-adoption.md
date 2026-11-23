# Schema 10 — S10-B Authoritative Geometry Adoption and Migration

**Status:** Implementation for P1–P4 is present in [PR #132](https://github.com/xbwtyz/Mappo/pull/132), with P5 final exact-head CI and owner review pending. **Not merged or released.** No tag or Pages authorization.

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
- **P5:** Targeted S10-A/S10-B and browser/Node regressions are in place. Earlier PR CI proved 572/572 Node tests and all four browser suites passed but the checked-in compiled distribution differed by a source-formatting byte change. The discrepancy was corrected in the source and compiled artifacts together; **the final exact-head CI result still controls merge readiness**.

### User-experience delta

Schema 9 edits previously relied on persistent flat `footprint` and `holes`. Schema 10 preserves existing simple-building editing behavior but stores only canonical regions and components. Users do not yet receive S10-C portals/nested occupancy editing, S10-D component editing, or S10-E unions. The foundation now supports future behavior without implicitly assigning ownership through courtyard containment.

### Merge gate

Remain on the dedicated feature branch until exact-head Node shards, all four desktop-browser suites, offline standalone byte parity, and the aggregate gate pass. Do not merge, tag, publish a release, or deploy Pages without separate owner authorization.
