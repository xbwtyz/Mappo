# Mappo Dev 4a — Property Deletion

**Version:** `0.1-dev.4a` · **Branch:** `feature/dev4-property-deletion`  
**Base:** merged 3I / `0.1-dev.3ie` · **Compatibility:** project schema 9 / workspace schema 1  
**Merge gate:** owner approval after all required CI checks succeed.

## User workflow

1. Select a property and choose **Delete property…** in the Inspector.
2. Read the confirmation listing the property name or ID, plot count, and building count. Cancel makes no changes.
3. Confirm to remove that property, every owned plot and every building on the site. Streets, districts, neighbors and landscape remain unchanged. The removed parcel becomes open ground in its original street block.
4. Use the map-topline **Undo Delete** control to restore the exact property, plot and building IDs/geometry/metadata during the session; **Redo Delete** reverses the restoration.

Undo is accessible without the deleted property still being selectable. On narrow screens the Inspector is collapsed after a successful deletion to leave the toolbar accessible.

## Model and history safeguards

- Pure candidate preparation clones the source project; checks that plot/building references are consistent before deletion.
- Recalculate the containing block's open-space area using the accepted land records, following the 3I pattern.
- Validate the entire schema-9 city, create the portable document, encode/decode it, and compare accepted city data exactly before swapping state.
- Bounded 20-operation, last-in-first-out session-only history stores removed records with original array positions and former open-space area. Undo/Redo restore or remove those same records atomically.
- Undo checks that the removed IDs remain unused and the block's open-space state has not changed. Redo confirms the restored records are unchanged. Stale operations are rejected rather than overwriting newer work.
- Structural and parcel edits, regeneration, and project load/recovery clear conflicting session history; accepted city records are portable but the history is not.
- Preserve the 3G/3H/3I building/property editing systems and older standalone distributions.

## Quality gates

- `tests/property-deletion.test.js`: no unrelated edits, correct child deletion, open-space accounting, round-trip, exact Undo/Redo, stale-history defense, compiled Inspector, and portable reload.
- `scripts/building-browser-qa.mjs`: actual Inspector delete/confirmation and Undo/Redo in Chromium and Firefox across desktop, ultrawide, tablet and phone.
- Existing regression, Save/Load, build parity and browser tests remain mandatory.
- `npm run build` must produce byte-identical `index.html` and `dist/mappo-0.1-dev.4a.html`.

**Out of scope:** property merging, property splitting, preserving buildings after deletion, moving neighbors or changing road topology, persistent Undo across project reloads.

[Standalone HTML](../../../dist/mappo-0.1-dev.4a.html) · [Roadmap](../../ROADMAP.md)
