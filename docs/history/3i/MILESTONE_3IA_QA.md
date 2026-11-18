# Mappo 3I-A — Property Preview Checkpoint

**Version:** `0.1-dev.3ia`  
**Branch:** `feature/property-plot-editing-3i`  
**State:** Implemented on feature branch; pending full CI and PR review, not merged.

## Functionality

- The Property Inspector offers **Edit property geometry** for existing four-corner properties.
- A transient `PropertyEditSession3I` snapshots the owning property's polygon, never referencing its accepted array.
- A distinct map overlay shows the current boundary and four selection handles. Clicking or tapping a handle selects it.
- The floating map panel reports the property ID, selected corner, Reset and Cancel. Apply is intentionally disabled until 3I-C.
- The session is scoped to the selected property. Map taps cannot select a different property while it is active; ordinary panning remains available.
- Entering building edit/placement, leaving City, regenerating the city, or loading a saved project ends the preview.
- No draft geometry appears in saved `.mappo.json` documents or recovery. Project schema 9 and workspace schema 1 remain unchanged.

## Tests

- `tests/property-edit.test.js`: start/select/reset/cancel and clone isolation; compiled UI and no accepted data mutation.
- `scripts/building-browser-qa.mjs`: property Inspector preview, disabled Apply, Reset/Cancel, unchanged accepted city across Chromium/Firefox and desktop/ultrawide/tablet/phone.
- Existing regression tests and historical standalone distributions remain intact.
- `index.html` and `dist/mappo-0.1-dev.3ia.html` are generated with the official `npm run build` and compared byte-for-byte.

## Intentional limits

3I-A **does not** permit moving corners, editing plot divisions or committing property mutations. Those changes belong to 3I-B and 3I-C, which must validate and reconcile related records before applying. No geometry is silently changed.
