# Mappo 3I — Property and Plot Editing QA

**Branch:** `feature/property-plot-editing-3i`  
**Standalone release candidate:** `0.1-dev.3ie`  
**Base:** merged 3H / schema 9 / workspace schema 1.  
**Merge restriction:** This is a development PR. Do not merge into `main` without a separate explicit owner approval.

## 3I-A — Non-destructive editor

The Property Inspector launches `PropertyEditSession3I`, scoped to one stable property ID. A ghost outline/handle overlay and floating controls support preview, Reset and Cancel, with no saved project mutation until Apply. Switching modes or projects clears transient draft state.

## 3I-B — Convex parcel and stable plot subdivisions

Property corners can be selected or dragged; numeric X/Y coordinates are supported. Existing internal plot dividers are adjustable as ordered frontage fractions. A pure geometry function reflows each original four-corner convex plot between the property's frontage and rear edges, preserving the exact plot ID/order/count and covering the parent quadrilateral. Illegal fractions or malformed corners are rejected by validation, not silently accepted.

## 3I-C — Validated atomic Apply

The inspector rechecks on each completed gesture. Apply requires changed, valid geometry and runs full preflight:
- Property remains a simple convex four-point polygon inside the same block.
- Street setbacks are calculated from road classes and block edges.
- Edited parcel cannot overlap another property.
- The new convex plots form a complete, nonoverlapping tiling with the same IDs.
- Existing buildings remain fixed and entirely inside the new property.
- Property area, frontage, local bounding information, plot polygons, linked building-to-plot references and dependent open-space area are reconciled.
- Whole project passes stored-project validator and portable create/encode/decode round trip.

Any failure leaves the accepted city unchanged. No road, neighboring property, building footprint or identity is changed.

## 3I-D — Property-scoped history

A maximum of 20 accepted property geometry operations is kept in session only. Undo/Redo restores property geometry, plots, building plot references and open-space area as one new validated/round-tripped project, preserving unrelated building/property names and uses. An unfinished preview blocks history. Structural/building edits invalidate property history to avoid restoring stale links. Load, browser recovery and city regeneration clear it.

## 3I-E — Regression and distribution

- `tests/property-edit.test.js`: session isolation; four-corner/plot tiling; safe Apply; rejection of invalid/encroaching geometry; schema 9; identity-preserving Undo/Redo.
- `scripts/building-browser-qa.mjs`: real Property Inspector activation, numeric corner preview and reset, validated Apply, property Undo/Redo in Chromium and Firefox for desktop/ultrawide/tablet/phone.
- Existing city, building and project-format regressions remain enabled.
- `index.html` and `dist/mappo-0.1-dev.3ie.html` must match byte for byte after the official `npm run build`.
- Historical 3I-A/B/C/D standalone snapshots and older versions remain in `dist/`.

## Deliberately outside scope

Property split/merge; altering plot count or ownership; cross-property transfers; arbitrary concave properties; moving roads or neighbors; automatic building relocation; 3D geometry/viewing. Those are separate future milestones.
