# Mappo 3G-B — Non-destructive Building Transform Preview

**Preview version:** `0.1-dev.3gb` · **Branch:** `feature/building-transform-3gb`  
**Baseline:** 3G-A merged on `main`, `34f8e9a5256518b03b48d5f339f8948aaa2c5e56`.  
**Status:** Submitted for pull-request review. **Do not merge without explicit approval.**

## User-visible controls

Select a property, choose its building in the Inspector, and press **Edit building footprint**. The map shows **Building Preview** controls with Move, Rotate, Resize, X/Y offset, angle in degrees, width and depth in survey units. **Move** drags the active roof; **Rotate** uses the outer circular handle; **Resize** uses square handles on corners/edges. Middle-button drag and Space + drag still pan; scrolling zooms.

The original accepted building remains visible beneath a translucent, dashed turquoise preview. Reset discards the preview while remaining in edit mode; Cancel exits. User-driven resets and exits with pending changes request confirmation, and the panel always warns when a draft would be discarded.

## Checkpoint implementation

- **B1:** `src/core/building-transform.js` provides pure translation, pivoted rotation and independent X/Y scale, including polygons, courtyard holes, entrances and access paths. Reject non-finite values and scales outside 0.2–4.0. `src/editor/building.js` owns only temporary transform values.
- **B2:** `src/ui/controllers.js` forwards pointer gestures to the active preview before ordinary panning; map scrolling and Space/middle-button panning remain unchanged. Numeric inputs provide X/Y position adjustments.
- **B3:** `src/renderer/building-editing.js` draws the ghost footprint and active resize/rotation/move guides; `index.template.html` adds responsive precision controls and reset/cancel actions. Angle, width and depth input support live previews.
- **B4:** Added `tests/building-transform.test.js` and `tests/building-transform-workflow.test.js`, extended `scripts/building-browser-qa.mjs` for preview checks and screenshots across Chromium and Firefox at desktop, ultrawide, tablet and phone widths, and compiled `index.html` plus `dist/mappo-0.1-dev.3gb.html`.

## Strict non-destructive boundary

- **No accepted building geometry is modified.** No changes to property/plot associations, city IDs, accepted footprint area, entrance, access path, orientation, accepted history or `src/data/`.
- Save/download, browser recovery, city regeneration and project load never persist an active preview. Schema remains **9**; the portable workspace schema remains **1**.
- A preview can leave its property or overlap another building; that is not proof of valid placement. Validation and controlled application are **3G-C**, while persistent transformations and Undo are **3G-D**. No misleading Apply/Save Preview action is present.
- Existing versions, including `dist/mappo-0.1-dev.3ga.html`, remain untouched. GitHub Pages deployment workflow is unchanged.

## Verification

The unified CI job runs Node tests (including preview geometry and compiled-app save invariants), deterministic standalone HTML parity, browser smoke tests and property/building browser QA with a **building-preview** screenshot for each viewport/browser pair. Inspect the PR Actions result before merge; this document does not assert successful tests in advance.

[Versioned 3G-B standalone HTML](../../../dist/mappo-0.1-dev.3gb.html) · [3G-A milestone](MILESTONE_3GA_QA.md) · [Roadmap](../../plans/README.md).
