# Schema 10 — S10-B Authoritative Geometry Adoption and Migration

**Status:** Owner-authorized implementation, checkpoint P1 in progress on dedicated branch. No merge, release, tag, or Pages authorization.

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
