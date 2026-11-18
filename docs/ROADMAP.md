# Mappo Development Roadmap

> **This is a status and planning document, not authorization to implement.** Every new feature milestone requires discussion and approval.

[Home](../README.md) · [Docs](README.md) · [3F historical plan](history/3f/MILESTONE_3F_PLAN.md)

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

**Stable main baseline:** `0.1-dev.3ie` from [merged PR #11](https://github.com/xbwtyz/Mappo/pull/11).

## Active development — Dev 4 small improvements

**Dev 4a — Property deletion:** Implemented on `feature/dev4-property-deletion` as `0.1-dev.4a`; pending CI and separate owner merge approval. Delete a selected property and its owned plots/buildings atomically, with session-only Undo/Redo and open-ground reconciliation. [Approved design and QA](history/dev4/DEV4A_PROPERTY_DELETION.md).

The Dev 4 cycle intentionally prioritizes small, independently approved changes rather than large new subsystems. The next minor improvement is not selected.

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
