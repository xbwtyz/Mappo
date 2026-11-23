# Schema 10 S10-D building components

**Review candidate** · Mappo `0.2.16-dev` · based on S10-C merge `551bca56c6e3`.

## Authoring and data contract

- A building keeps one ID, one use, one property owner and one frontage route. Components have building-scoped IDs and optional names. A new rectangle has a separate solid root with its component ID. Existing exterior and courtyard region IDs are retained.
- The inspector supports creating a detached rectangle, selecting an existing component on the map or in the component tree, applying numeric transforms, renaming, reparenting and removing leaf components. A transform of the whole building uses the extents of all its footprints. A component transform moves that branch, and reparenting keeps every part in place.
- The primary component retains the street entrance. Before Apply, validate all regions, plot occupancy, property containment, collisions and access, including existing courtyard routes. The edit and its updated frontage commit together and share one accepted Undo/Redo entry.
- Geometry version 3 uses the existing Schema 10 region and component records. This marker lets the S10-C standalone reject multipart authoring safely. Ordinary geometry v1, S10-C portal geometry v2, project Schema 10, portable envelope v1 and workspace schema v1 keep their contracts. Removing the final detached component restores the ordinary single-footprint representation.
- Touching or overlapping roots remain unavailable pending S10-E. The first component editor handles flat courtyard outlines and separate root footprints. S10-C portal hosts and linked courtyard occupants use the existing courtyard tools.

## Acceptance

| Checkpoint | Verification |
|---|---|
| P1 · Contract | Stable component and geometry IDs, single building identity, contained separate roots and older-reader rejection |
| P2 · Editing | Add and select three roots, rotate/scale/translate the whole building or a branch, preserve coordinates on reparent, reject cycles and overlapping roots |
| P3 · Access | Recompute occupied plots, retain validated frontage, protect affected courtyard routes, and verify property redivision and compound transforms |
| P4 · Persistence | One accepted Undo/Redo transaction, portable save round trip, safe rejection by the archived S10-C standalone |
| P5 · Desktop acceptance | Offline Firefox and Chromium, deterministic root/dist build, exact-head Node and browser CI |

See `tests/building-components-s10d.test.js` and `scripts/building-components-browser-qa.mjs`.
