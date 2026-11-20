# Mappo 0.2E / E2 — Straight frontage-to-rear property splitting

> **Status:** Design direction approved 2026-11-20; implementation **not started or authorized by this document**. Produce E2 code only after separate owner approval. No merge, release, tag, publication, schema migration or mandatory owner QA is authorized.
>
> **Prerequisite:** [E1 property creation](E1_PROPERTY_CREATION_DESIGN.md) merged in [PR #58](https://github.com/xbwtyz/Mappo/pull/58). This document is the proposed E2 implementation contract under the [0.2E milestone](MILESTONE_0_2E_PROPERTY_DESIGN.md) and [master roadmap](README.md).

## 1. Approved experience and explicit limits

**User story:** In City / Select, choose an existing property, select **Split property**, drag one straight divider from the street-facing edge to the rear, adjust its percentage numerically if needed, review two preview parcels and their plots/buildings, then **Apply** or **Cancel**. Apply is disabled until the complete resulting city can be independently verified. The preview starts with Details collapsed; affected objects and consequential changes are visible in the ordinary view.

The approved **first E2 scope** is a single cut of an accepted **four-corner property**, across the frontage and rear at the **same normalized fraction**. Using accepted boundary order `[front-left, front-right, rear-right, rear-left]` and split parameter `t` (strictly between 0 and 1), use `lerp(p0,p1,t)` and `lerp(p3,p2,t)` as cut endpoints. Both new parcels are four-corner convex candidates, inherit the **same accepted frontage road**, and must individually pass frontage, setback, valid area and building-access rules. This is not arbitrary drawn geometry: on a skewed quadrilateral, the divider is a straight segment, not necessarily perpendicular to the street.

- No arbitrary-angled, curved or multi-segment divides, no concave-source splitting, no multiple cuts in one operation, no street move, no cross-block transfer.
- No silent resizing, relocation, slicing or deletion of buildings. A building crossing the new boundary is an **Apply blocker**, with a visible explanation and a way to reposition the draft line.
- No mandatory tutorial, setup wizard, participant recruitment, physical owner smoke test or forced feedback step. Explicit acknowledgement is required **only** for protected authored ownership changes that otherwise cannot be assumed safe.
- Split control must be discoverable in the **existing property Inspector**, reuse the existing map interaction and validation infrastructure, and never create a parallel copy of the 3I property editor or E1 creation UI.

## 2. Scope boundaries and current architecture

Existing assets to reuse rather than reimplement:

| Existing component | E2 responsibility |
| --- | --- |
| `src/core/property-geometry.js`, 3I property editing | Reuse four-corner frontage ordering and **existing** plot-divider geometry where applicable; lift pure subdivision operations into a shared, well-named helper, not E2-specific duplicates |
| `src/editor/property-application.js`, E1 creation | Reuse safe validation, project cloning, accepted-land invariants and save/reopen checks; factor utilities only where justified |
| `src/core/road-provenance.js` | A split is user-authored. Both successors must be **protected** from generated-only reflow, including when the parent was originally generator-stamped |
| `src/data/project-validation.js` | Final authority for convex plots, complete tiling, block containment, setbacks, unique IDs, building membership, and orphan rejection |
| `src/ui/property-workspace.js`, shared map/Inspector | One contextual **Split property** action, one draft overlay with keyboard and pointer support; existing selection remains primary |
| E1 `PropertyCreationHistoryE1`, existing structural histories | Reuse lifecycle/atomic revision conventions; avoid a redundant global history stack or silently replaying stale transactions |

`city.openSpaces` represents **area totals**, not vacant-land polygons. Splitting one existing property conserves its original total area. **Do not regenerate vacant land, rescale neighbors, or change open-space area** merely because the parent gains a child: prove the sum of the two successor areas equals the source area within the existing tolerance, and preserve the open-space record byte-for-byte. Full project validation remains required.

## 3. Geometry and eligibility contract

1. Source property must exist in the accepted city with four finite boundary corners in correct CCW winding, an unambiguous property → block → frontage-road relationship, an invertible orientation/frame, and existing plots that form a valid convex tiling. Legacy odd-shaped/ambiguous records remain intact but are **not E2-eligible**; explain why.
2. The one `t` parameter must yield **two nondegenerate convex quadrilaterals** whose union is the source polygon and whose interiors do not overlap. Require adequate area, frontage length and depth for **both** children; use the established E1/property validators and documented tolerances rather than quietly inventing exceptions.
3. Validate both candidates against the same parent block, boundary offsets, protected road edges, civic/water/terrain/defense constraints, all neighboring properties and each other. Both children must retain usable accepted road frontage and consistent property frame/local data.
4. Derive all cut geometry from **the accepted source**, never from mutated intermediate city data. When old plot dividers do not follow the supported frontage-to-rear strip representation, reject with a named reason rather than approximate them.
5. Preview computes and shows both child outlines, areas, frontage lengths, affected plots/buildings, residual unsupported dependencies and the exact intended side that retains the property ID. Display invalid sliver and access cases *while the draft remains editable*.
6. Reset/Cancel/Escape/tool exit clear the draft and preserve accepted city bytes, recovery revision, selection, saved project and accepted histories. Project load/regeneration clears E2 draft and E2 history safely.

**Deterministic identity policy:** the **frontage-start/left** successor retains the source property ID, independent of map orientation, previous selection or building counts. The **frontage-end/right** successor gets the next collision-free E1-style `PROP-xxxxx` ID. The original custom name, `customUse`, unknown fields and existing identity/provenance history stay with the retained side; **do not duplicate authored identity fields** to the new property. The new property's base usage is derived conservatively from its occupancy (empty ⇒ undeveloped; otherwise preserve the source non-custom generated usage where consistent). Both successors inherit the accepted block/district and same verified road frontage. Show the retained-side choice in the UI before Apply; swapping identity sides or arbitrary naming is deferred.

Record the source→two-successors relationship in bounded **schema-9-compatible optional record metadata** and a readable split preview/receipt. The preferred shape is an additive property-level lineage entry (source ID, both successor IDs, retained side, operation), with plot ID mappings and verified building transfers in the receipt; preserve pre-existing optional metadata and do not overwrite unsupported values. Existing projects without lineage continue to load; no new top-level schema field or version bump. **Gate:** prove persisted metadata survives exact format-1/schema-9 round trips without changing prior records on Cancel/Undo.

## 4. Plot partition and ownership reconciliation

E2 **must** create new plot ownership when a divider cuts an existing plot. It may not simply copy the old `plotIds` onto both children.

- Treat old convex four-corner plot strips as frontage fractions or clipping intervals on the parent frontage. Intersect every old plot with each of the two child polygons, in deterministic source plot order.
- Old plots entirely inside one successor **retain their existing IDs and all metadata**; update their `propertyId` only when the verified owner changes, and list every transfer in the normal impact summary.
- For a plot intersected by the split line: retain the old plot ID and its non-geometric metadata on the **frontage-start/left fragment**; assign a new deterministic `PLOT-xxxxx` ID to the right fragment. No two records share an ID. New fragments inherit only verified structural fields, not unreviewed custom/unknown identity fields.
- If splitting an annotated/legacy-unknown plot would require duplicating or discarding semantics that cannot be proven, **block Apply** and identify the record. Do not silently copy ambiguous metadata.
- Recalculate child `plotIds`, plot boundaries, block/property refs, IDs and geometric areas. Each child's plots must form a **complete, nonoverlapping convex tiling**, with no missing fragment, tiny sliver, orphan or duplicate plot.
- Use a small **shared, pure** clipping/partition helper that can support later E3/E4 work. Avoid changing the established 3I divider interface and plot-count behavior as a side effect of E2.

Do not mutate `city.openSpaces`, accepted block geometry, roads, other properties' plots, or district membership outside the two verified successors.

## 5. Building preservation and explicit authorizations

1. **Wholly contained on either side:** preserve footprint, holes, entrance, access path, ID, type, shape and identity exactly. Recompute only verified `propertyId`, occupying `plotIds`, and the parent `buildingIds` collections; maintain recorded frontage and independently verify viable access within the new property.
2. **Existing building moves to the right-hand property only in ownership, not position.** A normal preview spells out the transfer by name/ID. Generated, untouched buildings may follow a validated split with explicit summary on Apply; **customized or legacy-unknown buildings require an explicit in-context authorization per affected building**, or Apply remains blocked. Do not force acknowledgements for untouched structures.
3. **Crossing/touching ambiguously / not fully contained:** do not move, clip or auto-delete. Show the offending building and suggest a different `t`. Where geometric contact is ambiguous at tolerance limits, fail closed.
4. Validate entrance and path against new ownership/frontage, not just the fact that the road ID exists. If the existing access path crosses the sibling property, the split is invalid until adjusted; E2 does not invent or reroute access.
5. Preserve unknown authored metadata and old project records. If a dependent defense, district, civic, landscape, open-space or external reference cannot be proven unchanged, block the split rather than guessing or ignoring it.
6. Mark changed/new parcels as **user-authored / non-generator** so 0.2C/D's generated-only adaptations cannot overwrite the split later; include regression coverage against road edits.

## 6. Apply, Undo/Redo, and saved-project gates

The draft is always temporary; only a verified transaction can modify the accepted city:

```text
select source → edit fractional split draft → preview & impact/authorization
  → independent inspect of cloned candidate
  → check accepted city revision + draft freshness + approved choices
  → full schema-9 validator + portable encode/decode round-trip
  → ONE atomic Apply + ONE accepted revision + ONE whole-split Undo entry
```

- No project, downloaded file, browser recovery or accepted history changes before Apply. Invalid/blocked proposals keep the draft editable.
- One undo restores **the exact original property and plot list, building owners/plot refs, metadata, and selection** as a coherent change. One redo restores both successors; stale or cross-editor history fails safely. History is session-only, like E1; accepted geometry/lineage persists in saves.
- Existing property selection should point to the retained property after Apply; the new sibling must be immediately inspectable. Undo must not leave a dangling selection.
- Invalid Apply and failed serialization leave accepted state, revision and recovery unchanged. Deleting/rebuilding a city or loading a project clears the E2 draft/history without touching unrelated snapshots.
- Schema migration is out of scope. Continue to support older format-1/schema-9 fixtures and no silent rewriting of other project records.

## 7. Implementation checkpoints — ONE E2 cycle and PR

The checkpoints are **development/verification gates**, not instructions to spawn five feature branches or five PRs. Work on one new E2 feature branch from updated `main` **after separate implementation approval**. Prefer coherent development, a compact reviewed commit series, and one compiled final standalone distribution.

| Gate | Deliverable | Required evidence before proceeding |
| --- | --- | --- |
| **E2-A: source + ghost** | Property Inspector action, one fractional handle/numeric edit, two child outlines, Reset/Cancel/status, disabled Apply until valid | Unit geometry partition invariants; browser focus, keyboard, pointer/touch, and nonmutation on desktop/phone |
| **E2-B: plot partition + IDs** | Shared pure plot splitter, conservative ID/metadata/lineage mapping, ownership report | One/multiple plots; divider on exact plot boundary vs. crossing; tiny fragments; persisted custom/legacy fields; no orphans |
| **E2-C: buildings + access** | Deterministic assignment, protected transfer choices, collision/cross-boundary/access blockers | Unoccupied, one-sided and both-sided buildings; courtyard, adjacent structures, authored/unknown records, blocked crossings |
| **E2-D: transaction + history** | Independent full-project verification, atomic Apply, one-revision history and correct save/reopen | Stale draft/revision; validator failure; rollback/recovery isolation; exact Undo/Redo; old schema-9 fixtures |
| **E2-E: whole-feature acceptance** | New compiled `index.html` and versioned `dist/mappo-0.2-dev.e2.html`, user guide and acceptance report | Full Node regression, Chromium + Firefox desktop/phone, build parity, negative scenarios, PR checks pass |

Do not mark a gate complete on a green UI preview alone. A green preview only establishes a **candidate**; the project validator independently authorizes Apply.

## 8. Test matrix and merge gate

Minimum automated cases:

- **Fixtures:** radial, organic, planned and linear morphologies; Small and Large; new E1-created single-plot property; generated multi-plot developed property; customized older schema-9 project; land after road changes.
- **Geometry:** percent near left/right min, skewed quad, strict convexity, area/union equality, child width/depth minimum, cut on plot boundary, cut through plot, unsupported concave/non-four-corner source, unfronted/road-blocked site, roundoff/sliver tolerances.
- **Ownership:** split with no buildings; buildings left, right, both sides; custom and unknown right-side building; entrance crossing sibling; courtyard or footprint intersecting cut; plot metadata; district and land IDs; unaffected city records byte-for-byte.
- **Mutation/history:** repeated Cancel/Reset; stale/failed Apply; one revision only; global validator; Undo/Redo across both child properties; switch tools; close/reopen saved project; legacy migration; unrecoverable mixed histories rejected.
- **UI:** accessible status changes, reachable actions and map space with Details collapsed, keyboard and touch interactions under real Chromium/Firefox mobile viewport as well as desktop, no forced user interactions.
- **Performance:** compare supported Small/Large split preview/Apply against its own same-runner baseline, and do not regress the 0.2D road-edit suite; [#44](https://github.com/xbwtyz/Mappo/issues/44) tracks separate large-city input stalls.

**Pre-merge release gate:** full Node and browser matrix green on current PR head; reproducible root/standalone HTML byte identity; no app code duplication or unreviewed schema changes; published documentation updated to reflect actual tested support. PR remains open **until explicit owner merge approval**. Do not tag/publish a release from E2.

## 9. E2 completion criteria and deliberate deferrals

**E2 complete means** an ordinary valid four-corner property (including a multi-plot developed property where all ownership transfers can be safely verified) can be divided into two separately owned street-fronting properties; the user can see consequences and safely Apply/Undo/Redo/save/reopen with no lost custom data or orphaned plots/buildings.

**Defer to E3/E4/0.2F:** merging properties; arbitrary polygon or angled multi-part cuts; editing plot count independently of a property split; custom building-geometry repair; cross-property building relocation as a general tool; category changes; optional civic-space authoring; schema migrations; 3D. Refuse unsupported split scenarios gracefully instead of declaring full free-form subdivision.
