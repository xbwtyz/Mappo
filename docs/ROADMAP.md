# Mappo Development Roadmap

> **Status and planning only.** New feature implementations and merges require separate owner approval.

[Home](../README.md) · [0.1.0 release notes](releases/v0.1.0.md) · [0.2 planning branch](https://github.com/xbwtyz/Mappo/tree/planning/mappo-0.2a-road-network-foundations/docs/plans/0.2)

## Mappo 0.1.0 — Stable release

**0.1.0** was prepared from the merged Dev 4f baseline. The complete 0.1 feature-development series is on `main`.

| Area | Merged work |
| --- | --- |
| Initial city generation through 3E | Morphologies, city outlines, roads, plots, buildings, water/terrain, districts and fortifications |
| UI overhaul 1–7 | Modular responsive workspace and Inspector, browser QA |
| 3F | Property-first inspection, linked buildings, independent custom identities |
| 3G | Building footprint preview/validation, atomic Apply and scoped Undo/Redo |
| 3H | Manual building placement, replacement, deletion, history |
| 3I | Property boundary and plot-divider editing, safe Apply and history |
| Dev 4a | Property deletion and restoration |
| Dev 4b | Map interaction, selection focus, mobile polish |
| Dev 4c | Precision nudges, keyboard shortcuts, live measurements |
| Dev 4d | Inspector area/frontage facts and targeted validation diagnostics |
| Dev 4e | Clear all buildings from a property and contextual structural history |
| Dev 4f | Layer presets, PNG export and customizable download filenames |

Historical implementation artifacts and QA notes are retained in [`docs/history/`](history/) and `dist/`. Legacy saved-project fixtures remain protected; project schema remains 9.

## Mappo 0.2 — Approved 2D designer direction

**2026-11-19 approved direction:** 0.2C becomes **Road-First Editing with Intelligent City Adaptation**. Users deliberately move/reshape streets, the city locally reflows generated blocks/properties/buildings as provenance and validation allow, and users then fine-tune properties and boundaries. [0.2D](plans/0.2/MILESTONE_0_2D_ROAD_UX_PLAN.md) improves road editing before manual property tools. Later building, civic, and release phases remain planned.

See the [updated master 0.2 roadmap](plans/0.2/README.md) and [0.2C technical plan](plans/0.2/MILESTONE_0_2C_DESIGN.md).

**Current implementation:** 0.2A and B1–B5 are merged. The previous bounded-segment C1 prototype [PR #34](https://github.com/xbwtyz/Mappo/pull/34) passed its own CI but remains an **unmerged draft**, superseded as the product-level C1 contract. Its source can be reviewed and ported selectively; it is not evidence that the road-first user story is finished.

The **road intent must be previewable independently of property-fit constraints**; generated untouched parcels/buildings should adapt locally when supported. Protect authored/ambiguous records and water/terrain/defense infrastructure; require explicit conflict choices and independently validated, atomic Apply with reversible history. The editor must continue to support schema-9 saves, property-first selection and reproducible offline standalone HTML. Future 3D work is deferred.
