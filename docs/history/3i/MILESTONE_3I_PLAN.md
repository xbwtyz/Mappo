# Mappo Milestone 3I — Editable Properties and Plots

**Status:** Approved for implementation; merge requires separate explicit owner approval.  
**Base:** merged 3H, `0.1-dev.3he` (`main`).  
**Branch:** `feature/property-plot-editing-3i`.  
**Compatibility:** Project schema 9, workspace schema 1.  
**Delivery:** Every checkpoint commits modular sources, automated QA, and a versioned standalone HTML (`0.1-dev.3ia` through `0.1-dev.3ie`).

## Design constraints and invariants

- Property-first selection remains primary. The selected property ID, plot IDs, building IDs, custom names and uses remain unchanged.
- Roads, block polygons, other properties, and existing building footprints stay unchanged when editing a property.
- No automatic displacement/deletion of buildings. Preview indicates conflicts; Apply fails safely.
- Property boundaries are controlled convex quadrilaterals for this milestone. Base plots remain convex.
- Every plot remains within its property; plots must not overlap, and their summed area equals property area within schema tolerances.
- Existing plot count/ownership/IDs remain stable; reflow subdivision boundaries as a coordinated operation.
- Update property `boundary`, `area`, `frame` and `local` coherently; plot `boundary` and building `plotIds` are reconciled.
- Enforce block containment, street margins, neighboring property separation, building containment, entrance/access consistency and complete project validation.
- Use clone → validate → encode/decode schema-9 round-trip → atomic Apply. No draft belongs in project, recovery, or downloaded files.
- Property edit history is bounded to 20 session-only actions, is invalidated on incompatible structural edits and cleared on load/regenerate.
- Keep historical standalone distributions untouched. Do not alter stable `main` before separate merge approval.
- Preserve modularity for reuse in future 3D visualization.

## 3I-A — Safe Property Edit Mode

- Expose `Edit property geometry` from the property Inspector.
- Add a dedicated floating panel with an active-property label, mode, Reset/Cancel and disabled Apply.
- Render a non-destructive preview boundary with visible corner handles, while the current city remains unchanged.
- Keep editing confined to the selected property, protect against accidental selection/tool changes, and support keyboard/mouse/mobile affordances.
- Unit tests for preview isolation, UI activation and cancellation; browser smoke QA.

## 3I-B — Boundary and Plot Manipulation

- Drag property corners with pointer controls; provide frontage/rear/depth numeric controls where safe.
- Reflow subdivision based on stable plot IDs/count, and allow adjustment of internal divider positions.
- Keep the representation a valid convex quadrilateral; never silently mutate neighboring land.

## 3I-C — Exact Validation and Reconciliation

- Verify convexity/winding, edge self-intersection, block containment, road setbacks and neighbor overlap.
- Verify full and nonoverlapping convex plot tiling, preserved building containment and access.
- Recalculate area, frame/local, plot references and dependent geometry only when safe.
- Live validation statuses explain specific conflicts and highlight affected objects.
- Safe Apply rejects any candidate that fails schema 9 and portable round-trip.

## 3I-D — Property History

- Add property-scoped session-only Undo/Redo (20 actions), preserving unrelated identity fields.
- Restore property, plot and affected building references atomically with validation.
- Prevent stale history across 3G/3H structural edits, regeneration and load/recovery.
- Keyboard and inspector controls; tests for history isolation and save/reopen persistence.

## 3I-E — QA, Documentation and Distribution

- Extend Node regression and Chromium/Firefox browser QA for the entire workflow.
- Verify older schema-9 files load and round-trip; no save schema bump.
- Compile `index.html` and `dist/mappo-0.1-dev.3ie.html`; prove byte-for-byte identical.
- Update roadmap, user guide, release version, and PR with test evidence. Leave PR open until separately approved.

## Explicitly deferred

No property splitting/merging, new/deleted plots, cross-property ownership transfers, arbitrary concave land parcels, or direct road topology editing. A separate 3D prototype can follow once this geometry foundation is stable.
