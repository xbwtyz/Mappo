# Mappo Development Roadmap

> **Status and planning only.** New feature implementations and merges require separate owner approval.

[Home](../README.md) · [Published 0.2.0 notes](releases/v0.2.0.md) · [Completed 0.2 roadmap](plans/0.2/README.md) · [Agent policy](DEVELOPMENT_RULES.md)

## Mappo 0.1.0 — First stable release (historical)

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

## Mappo 0.2.0 — 2D City Designer (published)

**Complete:** 0.2A–G and H1–H5 were merged through [PR #91](https://github.com/xbwtyz/Mappo/pull/91); [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0) was published after [exact-main CI](https://github.com/xbwtyz/Mappo/actions/runs/44960254289). v0.1.0 remains archived; civic sites and 3D are future proposals only.

[0.2H release plan](plans/0.2/MILESTONE_0_2H_RELEASE_PLAN.md) · [Master 0.2 roadmap](plans/0.2/README.md) · [0.2E detailed plan](plans/0.2/MILESTONE_0_2E_PROPERTY_DESIGN.md) · [0.2F detailed plan](plans/0.2/MILESTONE_0_2F_BUILDING_DESIGN.md) · [0.2G desktop workspace plan](plans/0.2/MILESTONE_0_2G_DESKTOP_UI.md) · [0.2D closeout](plans/0.2/MILESTONE_0_2D_ROAD_UX_PLAN.md).

### Why the dependency matters

0.2E and 0.2F established the parcel and building workflows the new UI must support. In 0.2G, Generation/Add/Roads is now the canonical desktop workspace while the existing engine, edit sessions and transaction rules remain authoritative. G4 verified cross-editor compatibility, offline operation and browser behavior. H1/H2 secured release gating and historical migrations. H3 [measured the worker-supported road editor](plans/0.2/H3_PERFORMANCE_AUDIT.md), merged as PR #89, and issues #44/#46 were closed after owner approval with remaining limitations documented. H4 is the [merged final desktop QA](plans/0.2/H4_RELEASE_QA_REPORT.md); the [H5 release-candidate review](plans/0.2/H5_RELEASE_CANDIDATE_REPORT.md) preserves pre-publication evidence for the now-published v0.2.0. Desktop and laptop browsers with mouse, trackpad, and keyboard are the support target starting in 0.2G.

All new feature changes require scoped design, a branch, passing full Node/Chromium/Firefox CI, byte-identical standalone output and separate owner merge approval. A future data schema change requires its own approved design, but **support for every older save is optional in future releases**; current v0.2.0 migration code remains. Issues [#44/#46](plans/0.2/H3_PERFORMANCE_AUDIT.md) were closed after performance review; [#79](https://github.com/xbwtyz/Mappo/issues/79) remains open. The [AI-agent rules](DEVELOPMENT_RULES.md) govern future work. No next milestone has been approved.

Earlier roadmap versions and planning branches retain their historical meanings; the **current** milestone labels above are authoritative for new work.
