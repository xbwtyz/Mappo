# Mappo 0.2F — Advanced 2D Building Design (planning draft)

> **Status:** Roadmap sequencing approved after 0.2E property restructuring. Scope below is for review; **no implementation approval**. [Master roadmap](README.md) · [0.2E prerequisite](MILESTONE_0_2E_PROPERTY_DESIGN.md).

## Goal

Give users intentional control over genuinely **new** building geometry and meaningful building uses *after* the land ownership and plot restructuring tools are reliable. Buildings must remain valid children of properties and plots, not create a second land editor.

## Already shipped — do not reimplement

- 3F: property-first selection and child building Inspector; independently editable identity and descriptive uses.
- 3G: move, rotate, resize, preview, validation, Apply and scoped building history.
- 3H: add/replace/delete buildings; rectangle, L, T and courtyard shape presets; precise position/rotation, property ownership and frontage checks.
- Dev 4e: clear a property's buildings with one Undo/Redo.
- 0.2C/D: locally adapt generated building placements after road edits, with explicit decisions for protected customized structures.

0.2F must deliver more **expressive, editable geometry**, not repackaged existing transforms, duplicate Inspector panels or mandatory tutorials.

## Proposed development cycles

### F1 — Extend footprint vocabulary

- [ ] Design and validate additional legal 2D building outlines, with connected wings, concave forms or customizable courtyards as appropriate.
- [ ] Establish a single geometry representation compatible with existing footprints, holes and shared-wall constraints; determine whether schema 9 can express the selected features before approving any migration.
- [ ] Gate: render/validation parity, determinism and compatibility with every existing building preset and old save.

### F2 — Direct geometry editing

- [ ] Add preview-only editing of vertices, edges, wings and holes where geometrically valid, reusing the present building editor, keyboard/numeric controls and Apply/Undo/Redo.
- [ ] Reconcile dependent entrance, access path, roof footprint, occupied plots and owning property; reject overlaps, invalid holes and inaccessible geometry with specific correction guidance.
- [ ] Gate: building identity preserved, other buildings untouched, authored geometry never silently simplified, exact rollback and portable save/reopen.

### F3 — Meaningful building categories

- [ ] Separate **functional category/use** from geometry, building identity and procedural generation labels. Define stable, extensible semantics before changing persisted fields.
- [ ] Support appropriate category labels/uses and conditional metadata without rewriting customized names, altering footprints, or assuming building types from appearance.
- [ ] Gate: existing generated/custom/legacy building types round-trip, identity and category revisions preserve each other, and category changes never authorize geometry loss.

### F4 — Integrated QA and compatibility

- [ ] Chromium/Firefox desktop and phone tests for complex shapes, customization, interaction, failed Apply, Undo/Redo, recovery, legacy schema-9 saves and complete project validation.
- [ ] Demonstrate building edits on properties created/split/merged by 0.2E; test roads and frontage access remain coherent.
- [ ] Document limitations, measure performance and deliver identical root/versioned offline HTML. Merge/release separately approved.

## Review gates and dependencies

0.2E must establish reliable parcel/plot ownership and successor identity first. Choose which new shapes and category metadata are truly justified before coding. Avoid schema changes and duplicated geometry logic unless evidence shows existing representation cannot support the accepted scope.

After F: optional [0.2G civic-place editing](README.md#revised-dependencies-and-phases), then [0.2H release hardening](README.md#revised-dependencies-and-phases). Neither is implemented by this plan; 3D remains deferred.
