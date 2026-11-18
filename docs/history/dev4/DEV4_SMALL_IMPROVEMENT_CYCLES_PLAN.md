# Mappo 0.1 Dev 4 — Small Improvement Cycle Plan

**Status:** PROPOSED — awaiting owner approval to begin implementation.  
**Planning branch:** `planning/dev4-small-improvement-cycles` (documentation only).  
**Scope:** Group the 14 previously proposed minor improvements into **five separately releasable development cycles**, Dev 4b–4f, without introducing a new major subsystem.

> This plan is not permission to modify application code, begin a Dev 4b–4f feature branch, or merge any PR. Discussion and explicit approval precede implementation. The author-approved Dev 4a property deletion remains a separate draft PR and has its own QA/merge gate.

## Starting gate: complete Dev 4a independently

- [ ] Resolve [Dev 4a PR #12](https://github.com/xbwtyz/Mappo/pull/12)'s known phone-layout browser QA failure: the Inspector intercepts the **Redo Delete** toolbar button on Chromium and Firefox phones. The Node and distribution checks passed on that run, but browser QA **did not**.
- [ ] Rerun the complete CI suite on the exact current Dev 4a head SHA, including desktop/ultrawide/tablet/phone for Chromium and Firefox.
- [ ] Obtain separate owner merge approval for Dev 4a, merge if successful, and verify `main` is on `0.1-dev.4a` with root/distribution HTML parity.
- [ ] Start Dev 4b only after that gate, unless the owner explicitly changes the sequence.

## Cycle summary

| Release | One-cycle theme | Original suggestion IDs | Proposed grouped changes | Risk / size |
| --- | --- | --- | --- | --- |
| **0.1-dev.4b** | Map interaction and responsive clarity | 4b, 4c, 4m, 4o | Selection highlight; Zoom to selection; map readability; panel overlays and scrolling on tablet/phone | Medium; visual and layout, no model changes |
| **0.1-dev.4c** | Precise editing and shortcuts | 4d, 4e, 4h | Context-aware shortcuts; live dimensions; precise nudge controls | Medium; edit-session and input safety |
| **0.1-dev.4d** | Inspector information and validation feedback | 4g, 4i | Compact property fact summary; precise, actionable edit errors | Small–medium; presentation/diagnostics |
| **0.1-dev.4e** | Property maintenance and history clarity | 4f, 4n | Clear all buildings on a selected property; understandable context-aware Undo/Redo labels | Medium; transactional edit and history integrity |
| **0.1-dev.4f** | Views, export, and project naming | 4j, 4k, 4l | Layer visibility presets; clean current-view PNG export; useful/sanitized project filenames | Medium; view-only and output operations |

> IDs in the third column are the *original individual suggestions* (4b–4o); the first column is the **new grouped release/version identifier**. Each original suggestion appears **exactly once**.

## Dev 4b — Map interaction and responsive clarity

**Include original suggestions:** 4b selection highlighting, 4c Zoom to selected, 4m map readability, 4o responsive interface cleanup.

- [ ] Distinguish property hover, selected property boundary, internal plots, and individual building selection without masking roof or street details.
- [ ] Add `Zoom to selection` to relevant property/building Inspector contexts. Fit the real geometry and give appropriate viewport padding; preserve current selection and return control to the map.
- [ ] Improve line thickness, contrast, and label density at small and large zoom levels; maintain the existing layer toggles and map rendering semantics.
- [ ] Fix mobile/tablet Inspector overlap, small touch targets, inaccessible toolbar controls and panel scroll traps across the **existing** editor. Do not redesign the whole workspace.
- [ ] QA: map hit-testing, deselect/hover behavior, fit/camera bounds, narrow and ultrawide layouts, keyboard focus, and Chromium/Firefox snapshots.
- [ ] Deliver: `feature/dev4-map-interaction`, standalone `0.1-dev.4b`, tests, documentation, draft PR (no merge).

**Completion criterion:** An ordinary user can select, visually track, locate, and access a property or building's controls at all supported viewport sizes without accidental selection or blocked controls.

## Dev 4c — Precise editing and shortcuts

**Include original suggestions:** 4d shortcuts, 4e live dimensions, 4h precision movement.

- [ ] Define narrow, context-specific shortcuts: Escape for active preview cancellation (honor discard confirmation), Delete to **request** a deletion with confirmation (never silently delete), and safe Undo/Redo for the active editing context. Respect focus in text fields, popovers, and native browser shortcuts.
- [ ] Show changing width, depth, area and delta/position measurements for property/building previews without mutating accepted geometry.
- [ ] Provide nudge buttons and selectable increments for existing movement/position controls. Numeric and drag pathways must converge on the same preview/validation path; never bypass Apply.
- [ ] QA: focused-input safety, confirmation/cancel semantics, transformed/rotated buildings, precision and validity thresholds, focus visibility, and browser matrix.
- [ ] Deliver: `feature/dev4-editing-precision`, standalone `0.1-dev.4c`, tests, documentation, draft PR (no merge).

**Completion criterion:** All new precision operations are preview-only until Apply, are reversible/cancelable, and produce consistent geometry with drag and numeric editing.

## Dev 4d — Inspector information and validation feedback

**Include original suggestions:** 4g property Inspector summary, 4i improved validation messages.

- [ ] Present a compact property facts summary: area, street frontage, plots, building count, and **estimated unbuilt area**. Do not label unbuilt area as a guaranteed buildable footprint or silently change building constraints.
- [ ] Explain invalid property/building edits with the actual target (road ID, neighbor property ID, building ID where available), what failed, and a useful remedy. Preserve stable error codes where needed.
- [ ] Surface errors in both preview panel and map-adjacent messaging, without overwhelming the view or hiding Apply/Cancel.
- [ ] QA: zero/multiple building cases, deleted/renamed property context, clear accessible message text, no data mutation, and browser matrix.
- [ ] Deliver: `feature/dev4-inspector-feedback`, standalone `0.1-dev.4d`, tests, documentation, draft PR (no merge).

**Completion criterion:** Selecting a property immediately communicates its practical characteristics, and failed edits explain what to fix.

## Dev 4e — Property maintenance and history clarity

**Include original suggestions:** 4f clear all buildings, 4n Undo/Redo clarity.

- [ ] Add **Clear buildings on this property…** to the property Inspector, separate from Delete Property. Show the building count, require confirmation, and retain property, plots, identity, geometry, frontage and streets.
- [ ] Make the clear action one validated, schema-9 safe transaction with one session-scoped Undo/Redo. Reuse/extract existing structural transaction rules rather than implementing a second independent building-removal model.
- [ ] Explain which action Undo or Redo will affect, which editing context is active, and why a history action is disabled. Make cleanup history accessible after selection changes while preserving conflict checks.
- [ ] QA: empty property, nonempty/merged property, exact restoration of building IDs and names, portable save/load, repeated delete/undo/redo, and interaction with 3G, 3H, 3I and Dev 4a history.
- [ ] Deliver: `feature/dev4-property-maintenance`, standalone `0.1-dev.4e`, tests, documentation, draft PR (no merge).

**Completion criterion:** Clearing buildings never deletes the property/plots or modifies adjacent parcels, and Undo restores the exact accepted buildings without stale-reference corruption.

## Dev 4f — Views, export, and project naming

**Include original suggestions:** 4j layer presets, 4k PNG export, 4l smart filenames.

- [ ] Add reversible **view-only** layer presets: Street View, Property Editing, Full City. Switching must not edit accepted city geometry or erase user data; keep regular per-layer controls.
- [ ] Export the **currently viewed city map** to PNG, matching the chosen layers and camera, but excluding editing handles, floating panels and selection/hover adornments. No network dependency or server-side rendering.
- [ ] Improve downloaded project filenames using a sanitized city name plus an appropriate version label; preserve portable format, consistent extension, and fallback name.
- [ ] QA: mixed layer configurations, no accidental model changes, exported PNG quality/size, browser download behavior, offline mode, filename sanitization and portability.
- [ ] Deliver: `feature/dev4-view-export`, standalone `0.1-dev.4f`, tests, documentation, draft PR (no merge).

**Completion criterion:** Users can switch perspectives and export usable visuals or project copies without touching the underlying city data.

## Release procedure, repeated independently for every cycle

1. Obtain explicit approval for the **proposed plan/cycle** before implementation. Grouping acceptance is not automatic code authorization.
2. Start the next cycle branch from the latest separately approved merged `main`; do not stack unmerged feature branches.
3. Keep pure geometry/transaction code isolated from UI; commit each coherent subtask/checkpoint. Preserve the one-file offline distribution and avoid runtime CDNs.
4. Maintain **project schema 9** and **workspace schema 1** unless a later change explicitly requires a reviewed migration. Do not regenerate or silently move existing buildings or properties.
5. Produce the versioned `dist/mappo-0.1-dev.4<cycle>.html` and checked-in root `index.html` from the official build. Confirm byte-for-byte parity.
6. Run all Node regressions, distribution parity, and Playwright Chromium/Firefox matrices at desktop, ultrawide, tablet and phone sizes. Add focused tests for the cycle's new user interactions.
7. Record QA results and limitations in `docs/history/dev4/`, open a **draft PR** with the compiled HTML and CI results, and **stop before merging**.
8. Merge only with separate owner approval **and** a green CI run for the exact current PR head. Reconfirm `main` and distribution parity after merge.

## Exclusions and later possibilities

- **No 3D, plot subdivision/merging, redesigned procedural generator, large UI overhaul, or new save-data architecture** in Dev 4.
- Major editor features may be proposed after these cycles; their scope requires separate discussion.
- If QA reveals an unrelated existing defect, isolate a narrowly scoped hotfix rather than expanding the approved cycle unexpectedly.

## Owner decision requested

- [ ] Approve all five development cycles **as the Dev 4 roadmap**, then explicitly approve the first cycle to implement, or
- [ ] Change grouping, order, or contents before any code work.

**Current release dependency at time of plan:** `main` is `0.1-dev.3ie`; Dev 4a is in draft [PR #12](https://github.com/xbwtyz/Mappo/pull/12), and its latest CI run [#44405883390](https://github.com/xbwtyz/Mappo/actions/runs/44405883390) failed the Chromium/Firefox phone browser matrix because the Inspector intercepted the Redo Delete control. This is a release blocker, **not** permission to repair or merge Dev 4a in this planning task.
