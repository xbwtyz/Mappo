# Mappo Development Roadmap

> **This is a status and planning document, not authorization to implement.** Every new feature milestone requires discussion and approval.

[Home](../README.md) · [Docs](README.md) · [3F historical plan](history/3f/MILESTONE_3F_PLAN.md)

## Proposed next major release — Mappo 0.2

**Direction chosen:** complete the 2D city designer before 3D rendering. **Road-editing policy:** staged editing (strict preservation first, then impact previews and explicit controlled local reconciliation).

- [0.2 overall roadmap and phase layout](plans/0.2/README.md)
- [0.2A road-network foundations: A1–A4 plan](plans/0.2/MILESTONE_0_2A_PLAN.md)
- [0.2A preservation and QA contract](plans/0.2/ROAD_EDIT_CONTRACT.md)

These documents are **planning only**. No 0.2A code has been authorized; merging any future 0.2 implementation requires separate owner approval.

## Completed and merged

| Milestone | State | Result |
| --- | --- | --- |
| Foundation through 3E | Complete | City shapes, streets, plots and buildings, water/terrain, districts/defenses, editor tools |
| UI overhaul Phases 1–7 | Complete; merged | Modular workspace, Inspector, responsive controls, browser QA |
| 3F-A / 3F-Aa | Complete; merged | Property-first selection and child building inspection |
| 3F-B | Complete; merged | Read-only generated site/building facts |
| 3F-C | Complete; merged | Custom identity for properties and buildings |
| 3F-D | Complete; merged | Portable validated Inspector selection and integration QA |
| 3G-A | Complete; merged | Visual-only Building Edit Mode and same-property targeting |
| 3G-B | Complete; merged | Non-destructive move, rotate and resize previews |
| 3G-C | Complete; merged | Geometry validation, frontage reconciliation and atomic Apply |
| 3G-D | Complete; merged | Session-only building footprint Undo/Redo and portable persistence |
| 3H | Complete; merged | Property-first manual building placement, replacement, deletion and structural Undo/Redo |

| 3I | Complete; merged | Editable property bounds, safe plot subdivision and validated Undo/Redo |

**Stable main baseline (at plan creation):** `0.1-dev.4e` from [merged PR #18](https://github.com/xbwtyz/Mappo/pull/18).

## Active development — Dev 4 small improvements

**Dev 4a–4e:** Completed and merged, including property deletion, map interaction, precision editing, Inspector guidance and bulk building clearing. See [Dev 4 historical QA](history/dev4/DEV4E_BULK_CLEAR_QA.md).

**Dev 4f:** Active draft [PR #19](https://github.com/xbwtyz/Mappo/pull/19) on `feature/dev4f-layer-export-filenames`, adding layer presets, PNG export and download filename preferences. Not merged at the time this plan was created. Plan 0.2A implementation from the latest approved merged `main`, not from the 0.2A documentation branch.

The Dev 4 cycle prioritizes small, independently approved changes before the 0.2 topology work.

## Completed details — Milestone 3G Building footprint editing

- **3G-A:** Complete and merged — temporary building selection/edit context. [3G-A QA](history/3g/MILESTONE_3GA_QA.md).
- **3G-B:** Complete and merged — preview-only move, rotate, resize and precise controls. [3G-B QA](history/3g/MILESTONE_3GB_QA.md).
- **3G-C:** Complete and merged — polygon validity, containment/collision checks, plot references, frontage reconstruction, live feedback and atomic Apply after schema-9 save/load verification. [3G-C QA](history/3g/MILESTONE_3GC_QA.md).
- **3G-D:** Complete and merged — bounded session-only scoped Undo/Redo of accepted building geometry and safe persistence. [3G-D QA](history/3g/MILESTONE_3GD_QA.md).

**3G-D, 3H and 3I are merged.** Protect property-first selection, record identities, schema-9 compatibility and historical distributions.

## Later ideas, not committed schedules

- **3H:** Complete and merged — property-first placement, four building presets, validated add/replace/delete, session-only structural Undo/Redo, and cross-browser QA. [3H QA](history/3h/MILESTONE_3H_QA.md).
- **3I:** Complete and merged — parcel editing with validated Apply and session-only Undo/Redo. [3I QA](history/3i/MILESTONE_3I_QA.md).
- **3D direction:** Explore 3D views of reusable logical city geometry without coupling saved data to the 2D Canvas renderer.

Feature names and order may change after design review.
