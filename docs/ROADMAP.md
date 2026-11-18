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

**Stable public release:** `0.1-dev.3fd` from [merged PR #2](https://github.com/xbwtyz/Mappo/pull/2). **3G-A preview:** `0.1-dev.3ga` on `feature/building-editing-3g`, pending explicit PR merge approval.

## Next proposal: Milestone 3G — Building footprint editing

- **3G-A:** Implemented on the feature branch, **not merged yet** — transient building edit mode, same-property targeting, visual-only guides, no geometry changes. [Design and QA](history/3g/MILESTONE_3GA_QA.md).
- **3G-B:** Move, rotate and resize existing building footprints.
- **3G-C:** Enforce property containment, non-overlap and valid editing feedback.
- **3G-D:** Scoped Undo, portable persistence, backward compatibility and compiled/browser QA.

**3G-A was approved for implementation.** 3G-B through 3G-D remain future proposals requiring separate approval. Protect property-first selection, accepted geometry, record relationships, compatibility and standalone distribution.

## Later ideas, not committed schedules

- **3H:** Manual building placement, deletion and replacement within existing properties.
- **3I:** Property/plot shape editing subject to street setbacks and occupancy constraints.
- **3D direction:** Explore 3D views of reusable logical city geometry without coupling saved data to the 2D Canvas renderer.

Feature names and order may change after design review.
