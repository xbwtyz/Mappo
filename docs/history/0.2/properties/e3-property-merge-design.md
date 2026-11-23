# Mappo 0.2E / E3 — Conservative adjacent-property merging

> **Status (2026-11-20):** Proposed design for owner review. E1 ([PR #58](https://github.com/xbwtyz/Mappo/pull/58)) and E2 ([PR #60](https://github.com/xbwtyz/Mappo/pull/60)) are merged. **No E3 implementation, merge, schema migration, tag or release is authorized by this document.** Build E3 in a separate feature PR only after its identity/conflict and geometry contracts are approved.

## Purpose and user-facing contract

Select a property in the existing Inspector → **Merge properties** → choose an eligible neighboring property using the existing map/property selection → preview the combined parcel and all affected plots, buildings and identities → explicitly resolve any protected metadata conflicts → **Apply**, **Reset** or **Cancel**. Keep the normal map responsive and do not add mandatory walkthroughs, setup, owner-run QA or new editor modes that duplicate existing systems.

The first E3 cut is **the conservative inverse of E2**: two accepted, **four-corner convex frontage-to-rear strips**, side-by-side with one exact full-depth common side, aligned front/rear boundary endpoints and the **same verified block, frontage road and compatible frontage frame**. Their union must be exactly one four-corner convex parcel with usable accepted road frontage. Split siblings created by E2 are a principal fixture, not the only permissible pair. Multiple properties, corner-to-corner contacts, partial side contacts, gaps, overlaps, mismatched roads, different blocks, concave/polygonal unions, crosses over roads and geometry requiring a boundary adjustment must be rejected with specific reasons. Do not alter either source or nearby streets to make a union fit.

## Proposed decisions for approval

1. **Identity owner:** The **property selected first (primary)** retains its ID, name and authored metadata. The secondary property's ID is retired; its authored metadata is *never* silently transferred to the primary or discarded. Before Apply, display both source names/IDs and the explicit retained-ID choice. Switching which site is primary can be achieved by starting the operation from the other property; no automatic “most customized wins” heuristic.
2. **Protected metadata:** For a secondary property containing any user-authored or unknown custom fields, require a **specific confirmation of retirement and an auditable metadata snapshot in a schema-9-compatible optional lineage record**. If the snapshot cannot be persisted and verified unchanged through the portable round trip, block Apply. This consent does not permit deleting/moving buildings, losing plot annotations, or defeating project validation. For unannotated generated secondary properties, a clear preview is sufficient.
3. **Both sources remain auditable:** Add bounded, additive `propertyMergeHistoryE3` optional metadata to the surviving property with source IDs, retained ID, retired ID, operation name, and protected metadata receipt/snapshot when authorized. Preserve prior E2 split lineage and unknown fields on the retained property. Reject unsupported lineage types; never overwrite an existing field or introduce schema 10.
4. **Plots stay identifiable:** Preserve every old plot ID, authored plot annotation, shape and ordering when geometrically and structurally valid. Only verified `propertyId` ownership changes; property `plotIds` becomes one deterministic list ordered along shared frontage. If old plots cannot tile the combined boundary exactly under the current project validator/3I representation, reject the merge rather than regenerate plots or silently fold them together; plot-count editing belongs to E4.
5. **Buildings do not move:** Preserve footprint, holes, entrances, access routes, IDs and names. Reassign only verified `propertyId` and any necessary valid plot membership, retaining each building's existing plot IDs when the verifier permits. Building access must be valid against the combined parcel and verified road. Unresolved frontage, ambiguous membership, invalid access or protected infrastructure blocks Apply.
6. **No draft side effects:** Draft changes cannot alter accepted city, recovery, file revisions, history or serialized project. Reject stale projects/selection and superseded drafts. A successful independent full-project/schema-9 Apply creates **exactly one accepted transaction and one Undo/Redo entry**, with exact reverse restoration of both properties and their metadata; loading or regenerating clears E3 history. E3 should reuse E1's structural-history contract rather than invent another global history stack.

## Geometry and source eligibility

- Use the **accepted** source polygons and canonical frontage order `[front-left, front-right, rear-right, rear-left]`, not a view transform or draft-mutated city.
- Verify source polygons are finite, four-corner, convex CCW, and each has unambiguous plot tiling, `frame`, `local`, district/block, road and frontage references; reject ambiguous legacy records without modifying them.
- Identify the shared edge with tolerance consistent with existing 3I/E2 geometry, but never turn a tolerance into a visible gap/overlap. Require that one source's right-front and right-rear corners coincide with the other's left-front and left-rear corners, or vice versa.
- Construct the four-corner union from the *outer* frontage/rear corners. Verify source areas sum to union area, frontage lengths are conserved, legal minimums hold, no sliver/overlap exists, and the union passes geometry and whole-city checks.
- Maintain independent frontage and setback protection and block/district membership. `city.openSpaces` and all unrelated accepted records remain byte-identical.
- Guard against duplicate IDs, non-adjacent sources, shared vertices only, roads that merely share an ID without matching frontage geometry, and properties with unsupported plot geometry.

## Reuse and modularity

| Existing asset | E3 role |
| --- | --- |
| `src/core/property-geometry.js`, E2 strip geometry | Canonical frontage orientation, strip tiling and tolerance utilities; extract one small shared pure helper only when needed |
| `src/editor/property-split-e2.js` and E1 structural history | Existing non-destructive, independently validated whole-project Apply/Undo/Redo; avoid a second general history layer |
| `src/data/project-validation.js` | Full legal geometry, ownership, frontage, building and round-trip validation |
| `src/core/road-provenance.js` | Both generated and authored source properties become protected user-authored merge results |
| Shared Inspector, map, renderer and `src/ui/property-workspace.js` | One context action and preview; avoid a competing property editor or mandatory wizard |
| `scripts/build.mjs` and existing browser test pipeline | Versioned offline HTML, byte-identical root build, Chromium/Firefox desktop and phone QA |

## E3 implementation checkpoints — one feature cycle, one feature PR

- **E3-A — Eligibility and preview:** Pure adjacency/union geometry; deterministic neighbor candidates; inspect-only preview; map/Inspector start, choose, Reset/Cancel; blocked cases with actionable status. Verify snapshots are unchanged during draft.
- **E3-B — Identity and plot reconciliation:** Explicit primary ID, secondary metadata policy and lineage; preserve plot IDs and metadata; compute safe ownership, reject unsupported annotations/tiling.
- **E3-C — Building/access preservation:** Validate each building's retained geometry, access path, entrance, verified plot memberships and property ownership. Report every reassignment; no implicit physical edits.
- **E3-D — Atomic Apply/history:** Fresh authoritative candidate on Apply, revision guards, exact schema-9 project and portable format-1 validation, one history event with exact Undo/Redo, stale-draft and project replacement handling.
- **E3-E — Full QA and integration:** Unit tests, Node regression, Chromium/Firefox desktop+phone (mouse/touch/keyboard), all four morphologies, small/large fixtures and legacy schema 9; compile `dist/mappo-0.2-dev.e3.html` plus byte-identical root `index.html`; remove temporary workflows and document acceptance evidence. Separate review and merge permission.

## Required acceptance matrix

1. **Round-trip E2:** Split a suitable empty four-corner property, then merge its siblings. Area, original IDs, plot metadata and independent source geometry must have an exact, auditable recovery path; do not assert a byte-identical source after a *new accepted merge* unless lineage is designed to permit it.
2. **Generated adjacent parcels:** Two valid same-block/same-road parcels merge deterministically; neighboring sites, open-space areas, roads and districts remain unchanged.
3. **Identity conflicts:** Customized secondary name/usage/unknown fields require explicit acknowledgement and persisted snapshot; cancel or decline changes no accepted bytes. The primary identity is retained unchanged. Unsupported unknown lineage blocks.
4. **Plot integrity:** Multiple plots, custom plot metadata, arbitrary old plot IDs and E2-created plot fragments; exact total coverage, no duplicate or orphan records, no silent plot-count reduction.
5. **Buildings/access:** Buildings with retained IDs/footprints, protected/legacy metadata, holes, entrances and access paths; blocked ambiguous plot membership and invalid paths.
6. **Negative geometry:** Partial-edge contact, corner touch, nonadjacent, different block/road, mismatched frontage, overlap, gap, concave union, degenerate source, unsupported plot tiling.
7. **Session safety:** Undo/Redo after success, cancellation/reset/invalid draft/no-mutation, stale revision, selection switch, load/regeneration and portable save/reopen.
8. **Performance and distribution:** Reproducible browser UI and Node CI with no new network dependency; compare Large sample latency and avoid main-thread regressions; byte-identical compiled standalone output.

## Deferred

Arbitrary multi-property and non-four-corner merges, rewriting plots to reduce their count, polygon boolean cleanup, building geometry changes, cross-road/cross-block joins, schema migration, 3D and publication of Mappo 0.2 are **not** part of E3. General plot-count editing belongs to E4.

## Merge gates

Owner approval of this identity/conflict policy and E3 geometry scope → separate implementation branch from updated `main` → code and full tests → independently review PR and green latest CI → explicit merge approval. A documentation-only planning PR may be merged independently if approved.
