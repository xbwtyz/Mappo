# Mappo 0.2E / E4 — Plot Count Changes and Dependency Reconciliation

> **Status (2026-11-20):** Design for review; **not implementation authorization**. E1 property creation (PR #58), E2 property splitting (PR #60), and E3 adjacent property merging (PR #62) are merged. No E4 code, schema migration, release, tag or publication is authorized by this document.

## Goal and user experience

Let a user deliberately **add or remove a plot divider inside a selected property**, changing the actual number of plots while the outer property and accepted street network remain unchanged. Keep the operation **inside the existing 3I Property geometry editor** and its Inspector/map controls; do not build a competing plot editor, wizard or compulsory walkthrough.

Normal path: select property → Edit property geometry → **Add divider** at a legal frontage position or **Remove selected divider** → inspect grouped plot IDs/metadata/building memberships and any required authorization → Apply once, or Reset/Cancel. Dragging an existing divider and editing boundary corners retain their established 3I behavior. Users can see the consequence of changed plot count immediately without writing to accepted records. The operation must stay discoverable with ordinary controls and keyboard/mobile access.

## Proposed identity and conflict policy — requires owner approval

1. **Split a plot:** Starting with one verified frontage-to-rear four-corner plot, insert one straight divider from frontage to rear. The **frontage-start (left)** successor retains the original plot ID and all its authored fields. The right successor receives the next deterministic unused `PLOT-` ID, verified owner/block/frontage, and only safe structural fields (no invented title/metadata). Display an auditable `source → retained/new` mapping. If the original has metadata whose meaning applies to the **entire old plot** (for example custom usage, rights or unknown fields), display a clear warning and require explicit consent to limit its future scope to the retained plot; unsupported semantics that cannot be recorded safely **block Apply**. Do not duplicate an authored annotation by default.
2. **Merge two plots:** Only adjacent plots belonging to the *same selected property*, sharing a full frontage-to-rear divider, with compatible road/frame. The **frontage-start (left)** plot retains its ID and authored fields. The other ID is retired. If the retired plot has authored or unknown fields, require an explicit retirement authorization and persist a complete metadata receipt in a schema-9-compatible optional lineage record on the surviving plot (or on the property if plot record lineage cannot round-trip safely). Never silently drop the retired plot's authored identity, conflicting rights or unknown fields.
3. **No automatic structural loss:** All buildings keep their ID, name, shape, holes, entrance and accepted access route. Every affected building's `plotIds` is recomputed against *actual geometric overlap* using the existing `deriveOccupiedPlots` implementation. A building may legally occupy multiple plots; no building is moved, deleted or assigned solely by nearest center. If any building has unresolved memberships, invalid access/frontage or protected metadata whose meaning cannot be preserved, block Apply with a locatable reason. No external civic/road/landscape record is reassigned.
4. **Lineage/consent must be independently checkable:** Save a stable append-only, bounded `plotCountHistoryE4` or equivalently scoped optional JSON structure, with operation, original/retained/new/retired plot IDs, origin geometry, consent receipts and a full snapshot of any retired annotated record. Protect prior E2/E3 lineages and unknown fields. Validate the entire project through the **existing** schema-9 portable format 1. If the old lineage shape is unsupported, block rather than overwrite it.
5. **One edit, one history step:** Preview, Reset, Cancel, selection changes, stale project/revision, and invalid Apply must be side-effect free. A successful Apply rechecks authoritative geometry and **all** project validators after drafting and enters accepted history **exactly once**. One Undo restores the exact old plot list/IDs/metadata/building memberships, and one Redo restores the accepted result. Session history clears upon load, regeneration or incompatible edits.

## Shape and geometry rules

- First E4 implementation is intentionally limited to **convex four-corner properties with plot strips oriented in the canonical 3I frontage order**: front-left → front-right → rear-right → rear-left.
- Use the existing `propertyDividerFractions3I` and `propertyGeometryPreview3I` as the authoritative basis. Generalize the preview interface for a caller-supplied **draft plot-ID sequence** rather than introducing an unrelated polygon-tiling engine. Preserve the old 3I fixed-count behavior for callers that do not request plot-count changes.
- **Add:** A user chooses an interval between existing divider ratios and inserts a new fraction strictly between its endpoints, subject to the shared minimum width, area and winding validators. At most **one new divider per Apply** in E4's initial scope. If one source plot is divided, only that source plot's boundary/metadata may be structurally changed.
- **Remove:** A user selects one existing divider, joining the immediately adjacent plots on both sides. At most **one divider removal per Apply** initially. No arbitrary multi-plot operations, nonconsecutive plots, detached polygons, cross-property/cross-road operations or geometry cleanup.
- Enforce exact area conservation, unique IDs, valid property coverage and road frontage, and no intersecting/sliver plots. Do not mutate open-space area for internal divisions since the property exterior is unchanged.
- Identity and area consequences must be explicit in the Inspector: unchanged, retained, created, retired, annotated, building membership changes and blockers. Do not show a misleading ready-to-Apply state for unsupported annotation policies.

## Reuse map

| Existing module | E4 responsibility |
| --- | --- |
| `src/editor/property-edit.js` | Extend **existing** session with draft plot ID plan, Add/Remove divider commands, selection and reset; no new editor mode |
| `src/core/property-geometry.js` | Extend canonical frontage-strip preview to accept the draft plot-ID list, preserving existing callers |
| `src/editor/property-application.js` | Reconcile plot additions/removals, affected building memberships and lineage in a cloned whole-project candidate; full validator and portable round-trip gate |
| `src/editor/building-application.js` | Reuse `deriveOccupiedPlots` for exact geometry rather than new ownership algorithms |
| Existing Property Inspector and `index.template.html` | Add divider count controls and grouped impact feedback in the 3I panel |
| `src/editor/property-history.js` and E1 structural history patterns | Use the existing one-operation accepted-edit history contract; avoid competing global Undo stacks |
| `src/data/project-validation.js` | Preserve all ownership, footprint/plot membership, area tiling and access validators, unchanged schema 9 |
| Build and browser test harness | Compile root and `dist/mappo-0.2-dev.e4.html` identically; run Node and Chromium/Firefox phone/desktop tests |

## Development checkpoints

- **E4-A — Design/preview:** Generalize 3I draft geometry for a variable number of plot dividers and plot identities. Add one-divider insert/remove and Inspector/map affordances, with visually distinguishable draft status and no accepted mutations.
- **E4-B — Identity and authored metadata:** Deterministic ID allocation and lineage, explicit consent UI for annotated source/retired records, robust unsupported-field blockers and no metadata duplication by guesswork.
- **E4-C — Building and connected references:** Recompute footprint-derived `plotIds` for all buildings on the edited property, revalidate access/frontage, preserve all physical building records, check independent validator and old-file compatibility.
- **E4-D — Atomic Apply/Undo:** Clone candidate, whole-project validation, schema-9 encode/decode comparison, stale-revision guards, exactly one history transaction and exact Undo/Redo.
- **E4-E — Stabilization and QA:** New Node and compiled Chromium/Firefox browser acceptance on desktop and phone, all morphologies/Small and Large fixtures, legacy schema-9, annotated plot conflicts, crossing/multiple buildings, save/reopen, and byte-identical root/versioned standalone. Document limitations and remove temporary workflows.

## Required negative and regression matrix

1. Add and remove a divider in an empty single-plot parcel; verify deterministic new ID and original ID retention.
2. Existing 3I divider movement and corner edits, E2 property split and E3 merge continue to work unchanged.
3. Building spanning the new divider gets the **correct two plot memberships**; removal collapses memberships without changing footprint, entrance, name or access path.
4. Annotated plot split requires consent when annotation cannot safely apply to both children. Unapproved or unsupported annotations block without changing anything; no duplicated notes.
5. Annotated retired plot merge records original annotated record and requires explicit authorization. Unknown metadata survives save/reopen through validated receipt.
6. Boundary-only contact, zero-area sliver, non-monotonic ratios, duplicate plot IDs, missing/foreign owner, malformed legacy polygons and stale draft all block.
7. Reset, Cancel, selection changes, invalid Apply and reloading the project leave the accepted city byte-equivalent and create no hidden history entries.
8. Apply → Undo → Redo, save/reopen, property deletion and subsequent road reconciliation never leave a plot or building orphan.
9. Generated Small/Large fixtures across radial, organic, linear and planned morphologies; no main-thread regression in interactive preview.
10. Current CI passes complete Node, Chromium and Firefox desktop/phone checks, compiled output reproducible and root byte-identical to the versioned E4 distribution.

## Acceptance and merge gates

1. Owner approves the **frontage-start identity retention, retirement consent and lineage** policy in this design.
2. E4 implementation starts from the latest `main` in a **separate** feature branch, with one reviewable feature PR (not an E4 code commit on the planning PR).
3. Review all ID/metadata/ownership changes; no schema change without independently approved migration.
4. Latest full CI and final build parity pass; temporary workflows are absent.
5. Only a **separate explicit merge approval** can integrate E4; do not tag, publish or declare 0.2 released.

## Deliberately deferred

Non-four-corner and polygonal multi-plot unions, multi-divider batch changes, automatic redevelopment or building movement, cross-property land ownership changes, rights/annotation semantic merging, schema 10 and 3D belong to separately designed later work. E5 will validate the integrated end-to-end property editing experience.
