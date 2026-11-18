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

**Stable main baseline:** `0.1-dev.3gd` from [merged PR #9](https://github.com/xbwtyz/Mappo/pull/9). **3H preview:** `0.1-dev.3he` on `feature/building-management-3h`, awaiting separate merge approval.

## Next proposal: Milestone 3G — Building footprint editing

- **3G-A:** Complete and merged — temporary building selection/edit context. [3G-A QA](history/3g/MILESTONE_3GA_QA.md).
- **3G-B:** Complete and merged — preview-only move, rotate, resize and precise controls. [3G-B QA](history/3g/MILESTONE_3GB_QA.md).
- **3G-C:** Complete and merged — polygon validity, containment/collision checks, plot references, frontage reconstruction, live feedback and atomic Apply after schema-9 save/load verification. [3G-C QA](history/3g/MILESTONE_3GC_QA.md).
- **3G-D:** Complete and merged — bounded session-only scoped Undo/Redo of accepted building geometry and safe persistence. [3G-D QA](history/3g/MILESTONE_3GD_QA.md).

**3G-D is merged. 3H implementation is approved but its merge is not.** Protect property-first selection, record identities, schema-9 compatibility and historical distributions.

## Later ideas, not committed schedules

- **3H:** Implemented on feature branch — property-first placement, four building presets, validated add/replace/delete, session-only structural Undo/Redo, and cross-browser QA. [3H QA](history/3h/MILESTONE_3H_QA.md).
- **3I:** Property/plot shape editing subject to street setbacks and occupancy constraints.
- **3D direction:** Explore 3D views of reusable logical city geometry without coupling saved data to the 2D Canvas renderer.

Feature names and order may change after design review.
