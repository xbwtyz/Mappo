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

## Mappo 0.2 — Proposed next milestone

**Direction chosen:** Complete the 2D city designer before a 3D renderer.

**Road-editing policy:** Staged editing. Start with strict preservation of existing city records; introduce explicit impact previews before any future, separately designed local reconciliation.

The proposal is saved on a **separate documentation-only planning branch**, not merged into 0.1:

- [0.2 master roadmap](https://github.com/xbwtyz/Mappo/blob/planning/mappo-0.2a-road-network-foundations/docs/plans/0.2/README.md)
- [0.2A technical plan, A1–A4](https://github.com/xbwtyz/Mappo/blob/planning/mappo-0.2a-road-network-foundations/docs/plans/0.2/MILESTONE_0_2A_PLAN.md)
- [Road preservation and QA contract](https://github.com/xbwtyz/Mappo/blob/planning/mappo-0.2a-road-network-foundations/docs/plans/0.2/ROAD_EDIT_CONTRACT.md)

0.2A: road graph, stable block identity matching, impact analysis and non-destructive preview. 0.2B: supported road edits. 0.2C: property creation/split/merge. 0.2D: advanced buildings. 0.2E: civic landmarks (conditional). 0.2F: final migration and release hardening.

**No 0.2 implementation is authorized by this roadmap alone.**
