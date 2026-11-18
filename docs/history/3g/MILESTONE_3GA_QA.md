# Milestone 3G-A — Visual Building Edit Mode

**Version:** `0.1-dev.3ga` · **Branch:** `feature/building-editing-3g` · **Base:** `main` after Pass C.  
**Status:** Implementation and compiled HTML committed for review; PR merge requires explicit approval.

## Scope

Approved 3G-A design: keep property-first selection, enter dedicated edit context from a selected child building, add distinctive footprint overlay and guide points, switch to another roof belonging to the **same** property, retain pan/zoom, and exit safely. This checkpoint **never edits** building footprints, project geometry, identity values, schema, or saved editor histories.

### Modular implementation

- `src/editor/building.js`: small `BuildingEditSession` storing temporary `buildingId` and `propertyId` with validated parent/child relationships, same-property targeting and stale-target exit.
- `src/ui/building-workspace.js`: explicit Enter/Exit Building Editing action in the existing Building Inspector, without replacing the independent identity form.
- `src/ui/property-workspace.js`: leaving to the owning property stops the edit context.
- `src/renderer/building-editing.js`: turquoise outline and noninteractive vertex markers, including courtyard contours. `src/renderer/canvas.js` draws it after selection layers.
- `src/app.js`: routes map taps/hover and section/layer/keyboard/load/regeneration transitions through the transient session. Existing `src/ui/controllers.js` continues to own panning/zoom without geometry-edit gestures.
- `tests/building-editing.test.js` and `tests/building-editing-workflow.test.js`: isolated state and compiled-HTML integration tests. `scripts/building-browser-qa.mjs` checks Enter/Exit and captures edit-mode screenshots in both browsers on four viewports.

## Interaction contract

1. Select a property, choose a linked building in Inspector, press **Edit building footprint**.
2. Parent boundary remains visible; focused building uses distinctive guides. Click another building **on that property only** to change active edit focus.
3. A tap outside that property is ignored during editing. Drag to pan, Space + drag, middle drag and zoom remain unchanged.
4. Escape, **Exit building editing**, **Back to property**, clicking Select/Pan or another editor tool, section change, building-layer hiding, city replacement and project loading end editing.
5. Portable save/load contains the normal validated Inspector selection but **not** the temporary editing state. Schema stays at **9**.
6. 3G-A provides **no move/rotate/resize, no geometry Undo, no manually placed buildings, and no 3G-C overlap-validation behavior**.

## Versioned distribution

- [Standalone `0.1-dev.3ga` HTML](../../../dist/mappo-0.1-dev.3ga.html)
- `index.html` is the identical compiled file; old `dist/` versions remain intact.
- The Pages deployment workflow is unchanged; the hosted app at `main` stays on 3F-D until an explicitly approved merge.

## Verification

The unified CI workflow runs the full Node regression suite, exact compiled distribution parity, and two native-browser suites on Chromium and Firefox across desktop, ultrawide, tablet, and phone. Test execution status must be verified from the branch/PR Actions run; **no passing test result is claimed in this document until CI completes**. The browser QA adds a specific `-building-edit.png` screenshot for each viewport/browser combination.

[Developer Guide](../../development.md) · [Roadmap](../../ROADMAP.md).
