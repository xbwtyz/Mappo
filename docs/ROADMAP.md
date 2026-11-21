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

## Mappo 0.2 — 2D City Designer

**Current sequencing.** 0.2A–D road editing, 0.2E property restructuring, and 0.2F advanced building design are merged. G4 desktop acceptance is merged through PR #87. **0.2H release hardening** is the active milestone, beginning with H1 manual release preparation and H2 historical save compatibility, both merged in PR #88. Civic places are deferred.

[0.2H release plan](plans/0.2/MILESTONE_0_2H_RELEASE_PLAN.md) · [Master 0.2 roadmap](plans/0.2/README.md) · [0.2E detailed plan](plans/0.2/MILESTONE_0_2E_PROPERTY_DESIGN.md) · [0.2F detailed plan](plans/0.2/MILESTONE_0_2F_BUILDING_DESIGN.md) · [0.2G desktop workspace plan](plans/0.2/MILESTONE_0_2G_DESKTOP_UI.md) · [0.2D closeout](plans/0.2/MILESTONE_0_2D_ROAD_UX_PLAN.md).

### Why the dependency matters

0.2E and 0.2F established the parcel and building workflows the new UI must support. In 0.2G, Generation/Add/Roads is now the canonical desktop workspace while the existing engine, edit sessions and transaction rules remain authoritative. G4 verified cross-editor compatibility, offline operation and browser behavior. H1/H2 secured release gating and historical migrations. H3 has measured the current worker-supported road editor; its [performance audit](plans/0.2/H3_PERFORMANCE_AUDIT.md) recommends leaving #44 open for residual UI stutters while #46's main junction Apply path is a closure candidate. H4 and H5 remain final QA and publication steps. Desktop and laptop browsers with mouse, trackpad, and keyboard are the support target starting in 0.2G.

All new feature changes require a reviewed implementation design, branch, passing Node/Chromium/Firefox QA, byte-identical root/versioned HTML and separate explicit merge approval. Continue schema-9 compatibility unless a migration receives its own approval. Keep [large-city responsiveness #44](https://github.com/xbwtyz/Mappo/issues/44) open. 0.2H follows the accepted desktop workspace; all H-stage merges and the eventual release need separate approval. 3D follows a stable 2D designer.

Earlier roadmap versions and planning branches retain their historical meanings; the **current** milestone labels above are authoritative for new work.
