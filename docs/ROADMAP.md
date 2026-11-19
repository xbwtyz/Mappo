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

**2026-11-18 roadmap update:** Flexible Road Editing becomes 0.2C. Manual property creation/splitting/merging follows in 0.2D, advanced buildings in 0.2E, conditional civic places in 0.2F, and 0.2 release QA/migration in 0.2G.

See the [updated master 0.2 roadmap](plans/0.2/README.md) and [0.2C six-cycle technical plan](plans/0.2/MILESTONE_0_2C_DESIGN.md).

**Current implementation:** 0.2A and B1–B4 merged. B5 [PR #32](https://github.com/xbwtyz/Mappo/pull/32) passed CI and is awaiting separate merge authorization. The 0.2C direction and plan are approved, **not 0.2C implementation, schema migration, release, or merge**.

The same staged preservation contract remains authoritative: detached previews, clear impacts, protected identities/metadata, local reconciliation only when proved safe, atomic Apply and reversible history. The editor must continue to support schema-9 saves, property-first selection and reproducible offline standalone HTML. Future 3D work is deferred.
