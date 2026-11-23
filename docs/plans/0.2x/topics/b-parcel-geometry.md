# Group B — Parcel, Property and Plot Geometry

**Status:** Planning only. **Priority:** High; largest shared limitation once road topology is stable.

## Current limitations and target outcomes

| ID | Current limitation | Candidate improvement |
|---|---|---|
| [B01](../issues/B01.md) · [#99](https://github.com/xbwtyz/Mappo/issues/99) | Convex four-corner property boundaries | General simple multi-vertex polygons, eventually safe concavity |
| [B02](../issues/B02.md) · [#100](https://github.com/xbwtyz/Mappo/issues/100) | Straight frontage-to-rear splitting | Approved angled/freeform partition types |
| [B03](../issues/B03.md) · [#101](https://github.com/xbwtyz/Mappo/issues/101) | Whole-edge, convex property merge | Partial-edge and irregular polygon merges |
| [B04](../issues/B04.md) · [#102](https://github.com/xbwtyz/Mappo/issues/102) | Frontage strip plots and one count change | General plot partitions and perhaps multi-action previews |
| [B05](../issues/B05.md) · [#103](https://github.com/xbwtyz/Mappo/issues/103) | Custom parcels often block road reflow | Auditable explicit parcel preservation/relocation decisions |

## Recommended architecture

**B01 must be treated as a geometry/model foundation, not merely a vertex-control UI task.** General polygon support affects property boundaries, plot tiling, frontage identification, setback validation, block coverage, building containment, road impact ledgers, selection, rendering and save round-tripping. Prefer one shared polygon utility rather than duplicating algorithms in the E2/E3/E4 editors.

Suggested staged contract:

1. **Represent and validate** supported non-four-corner property polygons with exact area, simple boundary, orientation and no self-intersection. Decide whether to start with convex N-gons or support concave-simple polygons immediately.
2. **Fit and reconcile** plot geometry and street frontage, building membership and access paths; preserve IDs and metadata.
3. **Expose editor controls** only after candidate and Apply pipelines prove safety; no fake green previews.
4. **Expand operations** B02 and B03; then B04 plot partitioning and B05 authored parcel decisions.

## Decision points

- Does every property require direct accepted-road frontage, including children of angled splits?
- Should properties support holes, or only non-self-intersecting single exterior rings initially?
- Can a property cross two frontage roads, and what does that imply for entrance/plot access?
- When two authored parcels merge, which ID survives and what requires explicit consent?
- Should multi-step plot edits ship separately from arbitrary plot shapes?

## Non-negotiables

Unknown authored fields, independent building footprints, protected roads, district ownership and safe unsupported-save rejection are **not** obstacles to be bypassed. Explicitly block unsupported transitions until validated. Any new schema or migration requires a separate, approved contract.