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

**Stable public release:** `0.1-dev.3gb` from [merged PR #7](https://github.com/xbwtyz/Mappo/pull/7). **3G-C preview:** `0.1-dev.3gc` on `feature/building-validation-3gc`, awaiting explicit merge approval.

## Next proposal: Milestone 3G — Building footprint editing

- **3G-A:** Complete and merged — temporary building selection/edit context. [3G-A QA](history/3g/MILESTONE_3GA_QA.md).
- **3G-B:** Complete and merged — preview-only move, rotate, resize and precise controls. [3G-B QA](history/3g/MILESTONE_3GB_QA.md).
- **3G-C:** Implemented on the pending feature branch — polygon validity, containment/collision checks, plot references, frontage reconstruction, live feedback and atomic Apply after schema-9 save/load verification. [3G-C QA](history/3g/MILESTONE_3GC_QA.md).
- **3G-D:** Scoped Undo, portable persistence, backward compatibility and compiled/browser QA.

**3G-B is merged; 3G-C implementation was approved.** 3G-D remains a future proposal requiring separate approval. Protect property-first selection, record identities, schema-9 compatibility and historical distributions.

## Later ideas, not committed schedules

- **3H:** Manual building placement, deletion and replacement within existing properties.
- **3I:** Property/plot shape editing subject to street setbacks and occupancy constraints.
- **3D direction:** Explore 3D views of reusable logical city geometry without coupling saved data to the 2D Canvas renderer.

Feature names and order may change after design review.
