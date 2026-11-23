# Mappo 0.2E / E1 — Property creation design and acceptance

**Scope:** E1 implementation branch only. No change to project schema 9, no release/publish or merge without separate approval.

## Model findings

Current `city.openSpaces` entries contain **a block ID and scalar area**, not available-land polygons. Therefore they cannot establish which coordinates are buildable. The E1 editor derives candidate geometry from the accepted **block vertices** and its oriented perimeter street edges, and checks the actual polygon against road margins, adjacent properties and the complete saved-city validator. No claim of automatic subdivision of every vacant region.

Existing 3I supports existing four-corner parcels and fixed plot dividers, 4a supports property deletion, and 3G/3H support individual building geometry. E1 extends these rather than creating a second editor for those features.

## E1 contract

1. Click **Create property** in City/Pan, then click a street block to choose a frontage edge and a non-destructive new footprint. A visible ghost can be dragged along the chosen frontage. The user can switch frontage or enter exact along-street position, width and depth.
2. Initial shape is a **single four-corner street-facing rectangle**, with **one convex plot** and **no buildings**. The frontage inset is computed from accepted street width, street edge and property setback. E1 deliberately does not create arbitrary concave parcels, transfer buildings or modify the road network. Those belong to E2–E4.
3. Validation uses the *actual* accepted block outline, road-setback geometry, neighbor overlap, minimum parcel area, recorded open-ground capacity and schema-9 ownership/access rules. Missing geometry, invalid frontage, overlaps, and unaccounted land block Apply with an explanatory status. Deleting an existing parcel can make verified land eligible for a new one.
4. Every new plot belongs exclusively to its newly created parent. Property and plot IDs use the next available deterministic numeric IDs, never recycle existing IDs. The property inherits its accepted block's district membership and receives `roadProvenance.source = "user-created-e1"` so later road adaptation treats it as protected user work rather than generated and replaceable.
5. The accepted city is never changed by clicking, dragging, numeric edits, Reset or Cancel. `preparePropertyCreationE1` clones the entire city, adds the property/plot, adjusts only the block's open-space area tally, validates the **whole project**, and verifies a portable format-1/schema-9 round trip. The app independently verifies the same project, file revision and draft before Apply.
6. One Apply creates one accepted change, and one session-scoped Undo/Redo restores the exact before/after city. History is not serialized. Another intervening edit that changes the city makes old creation history unusable. Loading or regenerating clears it.
7. Canvas placement does not steal other selection or tool states; entering creation is explicit and existing editors are blocked while its preview is active. Esc cancels. No required walkthrough, recruitment, feedback prompt or forced owner QA.

## Release acceptance

- [ ] Full Node regression and focused E1 unit tests across radial, organic, planned, linear and Small/Large city fixtures.
- [ ] Chromium + Firefox desktop and phone acceptance: real map click, numeric refinement, preview isolation, Reset, Apply, Undo/Redo, portable save/reopen.
- [ ] Reject invalid/inaccessible or overlapping drafts and lack of actual geographic vacancy (not just scalar open-space area).
- [ ] Preserve properties, generated and customized buildings, existing plots/IDs, roads, districts, water/terrain/defense data in unaffected land.
- [ ] Compile byte-identical `index.html` and `dist/mappo-0.2-dev.e1.html`. Confirm no E1 history or drafts in downloaded projects.
- [ ] Open an unmerged PR with documentation and CI evidence.

**Known intentional limitations:** E1 does not split/merge parcels, increase plot counts within existing parcels, resolve building ownership conflicts or construct footprints with no verified street-facing geometry. The engine may reject legitimate-looking gaps where road setbacks or other protected relationships cannot be proven. E2/E3/E4 will extend the land tools; the separate [issue #44](https://github.com/xbwtyz/Mappo/issues/44) remains open for large-city road-preview responsiveness.
