# Mappo Development Roadmap

> **Status and planning only.** New feature implementations and merges require separate owner approval.

[Home](../README.md) · [0.1.0 release notes](releases/v0.1.0.md) · [Current 0.2 roadmap](plans/0.2/README.md) · [0.2E property plan](plans/0.2/MILESTONE_0_2E_PROPERTY_DESIGN.md)

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

## Mappo 0.2 — 2D City Designer, post-D4 direction

**2026-11-20 sequencing decision:** 0.2A/B road foundations and conservative Apply → 0.2C road-first intelligent neighborhood adaptation → **0.2D usable road editing (all merged)** → **0.2E manual property creation/split/merge and plot restructuring (next)** → **0.2F advanced building geometry** → **0.2G optional civic places** → **0.2H integration, migration, performance and release hardening**.

[Master 0.2 roadmap](plans/0.2/README.md) · [0.2E detailed plan](plans/0.2/MILESTONE_0_2E_PROPERTY_DESIGN.md) · [0.2F detailed plan](plans/0.2/MILESTONE_0_2F_BUILDING_DESIGN.md) · [0.2D closeout](plans/0.2/MILESTONE_0_2D_ROAD_UX_PLAN.md).

### Why the dependency matters

3I already provides **existing** property boundary and divider edits; 3G/3H already provide building placement, basic shapes, move/rotate/resize, validation and Undo/Redo. E must supply missing **structural land operations** before F adds genuinely new building vertex/wing/hole capabilities. Generated parcels can adapt around road changes when validation permits, but customized and legacy-unknown data must never be silently discarded.

All new feature changes require a reviewed implementation design, branch, passing Node/Chromium/Firefox QA, byte-identical root/versioned HTML and separate explicit merge approval. Continue schema-9 compatibility unless a migration receives its own approval. Keep [large-city responsiveness #44](https://github.com/xbwtyz/Mappo/issues/44) open. Optional G may be deferred without blocking H; 3D follows a stable 2D designer.

Earlier roadmap versions and planning branches retain their historical meanings; the **current** milestone labels above are authoritative for new work.
