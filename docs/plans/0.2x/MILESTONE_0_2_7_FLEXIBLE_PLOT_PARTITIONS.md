# Mappo 0.2.7 — B04 Flexible Plot Subdivisions

**Issue:** [#102](https://github.com/xbwtyz/Mappo/issues/102) · **Architecture:** D-027-1=A, D-027-2=B, D-027-3=A, D-027-4=A, D-027-5=B, D-027-6=B, D-027-7=A, D-027-8=A.
**Status:** Owner authorized implementation checkpoints P1–P5, but merge, release and Pages publication require separate approval.
**Base:** main after 0.2.6 [PR #116](https://github.com/xbwtyz/Mappo/pull/116) · **Version:** 0.2.7-dev · **Schema:** 9 · **Portable envelope:** 1

## Goal and user experience
Before B04, E4 accepted one frontage-to-rear split or merge in a four-corner parent property per Apply.
B04 adds an optional **Edit flexible plots** panel inside the existing Property Geometry Inspector. Users can select a plot, set two straight cut endpoints by map or exact edge/percentage controls, choose the portion retaining the existing ID, split/merge neighboring convex plots, and queue multiple compatible operations before one Apply.

The original E4 controls remain for rectangular strip editing. Properties may be concave but every individual plot must remain convex and cover its share of the parent exactly. Internal plots are permitted; inherited schema-9 plot frontage references are **ownership metadata, not new physical access**. Existing building entrance/access and road links remain unchanged.

## P1 — Pure geometry
- [x] Convex polygon splitting by two interior boundary-edge points.
- [x] Verified convex union of adjacent plots sharing a complete opposite edge.
- [x] Exact area, containment, no interior overlap, winding, and nondegenerate geometry.
- [x] Positive and negative geometry tests.

## P2 — Bounded multi-operation draft
- [x] Up to 12 unaccepted operations against a detached draft plot list.
- [x] Split -> split and split -> merge with deterministic reserved IDs; one-step draft Undo.
- [x] Entire draft Reset/Cancel without accepted city changes.
- [x] Draft candidate rechecks the original accepted city before Apply.

## P3 — Identity and building reconciliation
- [x] User-controlled retained plot ID; created IDs are deterministic.
- [x] Authored original plot metadata requires affirmative consent when the geometry or ID changes.
- [x] Complete original plot snapshots, retired IDs and operation audit in bounded optional \`plotPartitionHistory027\`; existing E4 lineage remains.
- [x] Recompute exact building-to-plot membership using existing convex clipping; no changes to footprints, courtyards, entrances or access routes.
- [x] Complete schema-9 project validation and portable format-1 round trip; fail closed.

## P4 — Existing Inspector and map
- [x] Extension inside Property Geometry / Edit boundaries & plots (not a new workspace).
- [x] Selected plot, second plot, cut edges, numeric percentages, retained identity choice, metadata authorization, operation summary and draft Undo.
- [x] Cut endpoint positioning via map and draggable cut handles; preview overlays use draft-only geometry.
- [x] One atomic accepted Apply and one scoped Undo/Redo through existing history.

## P5 — Acceptance and review
- [ ] Full targeted Node, complete regression and Firefox/Chromium browser QA on the exact final head.
- [ ] Reproducible source build; root index.html byte-identical to dist/mappo-0.2.7-dev.html.
- [ ] PR opened for owner review with actual CI evidence.
- [ ] Separate merge authorization and post-merge main CI.

## Deliberate limits
- Convex individual plots only, no holes or concave plot interiors.
- Straight cuts only; no curved/multi-bend dividers.
- One fully matching opposing edge for plot joins; irregular or partial-edge plot joins requiring different topology are not silently approximated.
- Up to 12 draft actions per Apply, history/format capacity limits remain active.
- No cross-property parcel transfers, road generation, new access rights, building geometry changes, global persisted history, schema 10, or automatic redevelopment.
- Only manually edited plot partitions are expanded here; procedural plot generation is unchanged.
- No phone/tablet QA or heavyweight C7 benchmark by default.

## Source reuse and safeguards
Uses src/core/plot-partition-027.js, src/editor/plot-draft-027.js, src/editor/plot-application-027.js, the existing 3I session/apply/history/renderer/Inspector, project validator and building occupancy. Modular source must generate the offline single-file distribution. Keep legacy E4 regression fixtures and unchanged historical files.
