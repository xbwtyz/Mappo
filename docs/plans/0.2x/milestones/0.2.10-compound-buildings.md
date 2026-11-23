# Mappo 0.2.10 — C01 Compound Buildings

**Issue** [#104](https://github.com/xbwtyz/Mappo/issues/104). **Architecture:** D-030-1=A through D-030-8=A; **P1–P5 implementation:** separately owner-approved. **Branch** `feature/mappo-0.2.10-c01-compound-buildings`. **Base:** `main` `1b28564` with [post-merge CI success](https://github.com/xbwtyz/Mappo/actions/runs/45077771390). **Target:** `0.2.10-dev`; schema 9, envelope 1. No merge, release, tag or Pages authorization.

## User-visible outcome

On a property with two or more buildings, choose **Manage building compounds** in the existing Inspector. Explicitly select members and give the compound a name; create, update or dissolve the association without changing member geometry. Choose a saved compound and preview common-pivot move/rotate/width/depth adjustments through numeric controls; apply the entire group only after independent full validation. One scoped Structure Undo/Redo restores membership or the accepted geometry transaction. Existing individual building editor continues working.

## Approved contract

- **D-030-1:** Linked building records; each keeps its original ID and independent polygon.
- **D-030-2:** Detached and shared-wall components; positive-area overlap and arbitrary unions rejected.
- **D-030-3:** A group belongs entirely to one existing property and block.
- **D-030-4:** Explicit group creation/selection/link/unlink, common-pivot move/rotate/resize, all-member atomic Apply.
- **D-030-5:** Each member independently requires valid frontage, entrance and access.
- **D-030-6:** Optional `property.buildingCompounds` metadata; schema 9 and envelope 1 remain unchanged.
- **D-030-7:** Existing road/property editors preserve compatible group records; full-project validator blocks unsafe transfer/removal/reflow.
- **D-030-8:** Property Inspector + existing map building panels; no separate workspace or compulsory tutorial.

## P1 — Validation and deterministic fixtures

Validate unique compound IDs and member lists (2–32, same property, no duplicate group membership, max 128/property). Prove ungrouped cities unchanged and reject imported malformed or orphaned compound data. Include generated multi-building fixtures (existing compound wings/terrace rows), unknown metadata and properties with individually valid access.

**Gate:** Unmodified legacy schema-9 projects still pass; negative group inputs reject without accepted changes.

## P2 — Atomic membership and scoped history

Use pure `prepareCompoundMembership` to create/update/dissolve group metadata only on project clones, with full schema validation + portable round-trip. Extend `BuildingStructureHistory3H` property snapshots to include compounds. Never create a third history system. Preserve unchanged member records.

**Gate:** Create, rename, update, dissolve and whole-group Undo/Redo restore the expected group and members exactly; invalid proposals leave accepted project untouched.

## P3 — Coordinated preview and existing UI

Compute a common bounding-box pivot for current group members. Transform all exterior/holes/orientations on one detached project; validate all member geometries against the same proposed city to avoid order dependence; recompute occupied plot IDs and reattach independent frontage routes. Show group membership, names, selectable members and preview transforms in existing Inspector-linked tools. Overlay proposed footprints on the accepted map.

**Gate:** Two or more members move/rotate/scale together, invalid transforms remain previews, Apply is disabled until every member validates; Chromium/Firefox use existing desktop controls.

## P4 — Reconciliation, history and file integrity

Full-project validation guards any existing editor that transfers/removes building records. An invalid group never partially accepts: block incompatible road changes, splits, merges, deletions or auto-reflow. Every successful compound transform is one accepted property-scoped history record. Save/reopen must preserve unknown compatible extensions, and individual edits must not break membership.

**Gate:** Structural Undo/Redo restores exact before/after records, group metadata and all dependencies. Reset and Cancel do not mutate accepted data.

## P5 — Standalone, regression CI and PR

Update version to `0.2.10-dev`, rebuild `index.html` and `dist/mappo-0.2.10-dev.html` identically, test offline operation, run targeted Node/browser coverage then full two Node shards, four browser suites and aggregate gate on exact PR head. Document verified test totals, UI before/after, failures/resolution and limitations. Open one focused PR; no merge or release without separate owner authorization.

**Outside scope:** Arbitrary polygon union, nested courtyard islands, cross-property compounds, shared building frontage, generated castle templates, persistent universal history or derived 3D mesh implementation. These remain follow-up candidates, not completed capabilities.
