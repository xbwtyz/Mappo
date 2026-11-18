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

**Current release:** `0.1-dev.3fd`; [merged PR #2](https://github.com/xbwtyz/Mappo/pull/2) and successful automatic Pages deployment.

## Next proposal: Milestone 3G — Building footprint editing

- **3G-A:** Explicit building edit mode, starting from the parent property workflow.
- **3G-B:** Move, rotate and resize existing building footprints.
- **3G-C:** Enforce property containment, non-overlap and valid editing feedback.
- **3G-D:** Scoped Undo, portable persistence, backward compatibility and compiled/browser QA.

**Not yet approved for code implementation.** Keep property-first selection, accepted geometry safety, record relationships, compatibility and standalone distribution intact.

## Later ideas, not committed schedules

- **3H:** Manual building placement, deletion and replacement within existing properties.
- **3I:** Property/plot shape editing subject to street setbacks and occupancy constraints.
- **3D direction:** Explore 3D views of reusable logical city geometry without coupling saved data to the 2D Canvas renderer.

Feature names and order may change after design review.
