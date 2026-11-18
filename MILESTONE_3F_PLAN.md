# Mappo Milestone 3F — Building Inspector

Status: **Plan approved; implementation not started**.
Branch: `feature/building-inspector-3f`, branched from `main` after the Phase 7 UI overhaul merge (`40e64fb`).
Baseline: `0.1-dev.ui7d`; accepted city project schema **9** and optional workspace UI schema **1**.
Owner approval: implement the four ordered checkpoints below, using incremental commits, tests, and a compiled standalone HTML after each. **Do not merge into `main`, tag a release, or publish GitHub Pages without explicit approval.**

## Purpose and constraints

Let a user click an individual generated building, inspect its existing attributes, and optionally give it a custom name and descriptive use, **without altering its footprint or silently regenerating the city**.

Reuse the Phase 7 selection inspector (`src/ui/workspace.js` and `src/ui/workspace-inspectors.js`). Building records already have stable IDs within an accepted city (`BLD-...`), and contain `blockId`, `propertyId`, `plotIds`, `frontageRoadId`, `type`, `shape`, `footprint`, `holes`, `area`, `entrance`, `orientation`, and `roofTone`. The renderer already draws actual footprints and courtyard holes (`src/renderer/buildings.js`).

### Architectural rules

1. Separate **view selection** from **building metadata edits**. No generator or geometry coupling is needed to open an inspector.
2. Preserve generated `type`, `shape`, footprint, holes, property/plot references, roof information, and existing property `usage`. User-selected use is descriptive metadata, not a generator instruction.
3. Prefer optional, bounded, validated **per-building** fields for `customName` and `customUse` on the accepted record. Keep project schema 9 if this remains a backward-compatible addition; write a migration only if an actual data-contract change makes one necessary. Decide exact field representation during 3F-C and document it.
4. IDs are only stable **within the accepted city**. A full rebuild may reuse `BLD-...` IDs for different structures. Do not transplant manual names/uses by matching generated ID after a rebuild. Make potential loss of customizations explicit before a full regeneration; local district and defense updates should retain them.
5. Respect active tool ownership: drawing/geometry tools keep precedence and their original independent undo histories. In Select/Pan, preserve landscape hit priority, then choose a visible building before the underlying district/block; dragging remains pan, not a click selection. Hidden building layers must not produce invisible building hits.
6. Maintain a modular source + deterministic single-file offline HTML distribution, with no additional runtime dependencies. Preserve existing keyboard, mobile drawer, and accessibility behavior.

## 3F-A — Building selection and visual identity

**Goal:** Click a visible building on the map and open the shared Inspector with that building selected.

- [ ] Add a pure hit-test for building polygons, respecting courtyard holes and nearby overlapping outlines; ensure predictable tie-breaking and appropriate tolerance at different zoom levels.
- [ ] Integrate click selection only into the existing Select/Pan pathway: landscape first, then buildings, then district/block; empty space clears selection.
- [ ] Register a `building` selection kind with the generic workspace shell; select by stable building ID, resolve against the current accepted project, and safely clear stale references.
- [ ] Draw a distinct selected/hover outline in a renderer overlay without modifying the accepted footprint, other render layers, or view camera.
- [ ] Keep selection consistent with Layers visibility, tool changes, panel collapse, gestures, and project regeneration; do not turn a drag into a click.
- [ ] Add focused unit/integration tests for polygon holes, zoom, adjacent buildings, hidden layers, hit precedence, stale IDs, and interaction with district and landscape selection.

**Acceptance:** a house, compound wing or courtyard can be selected reliably from the Canvas, the correct record is highlighted, existing water/district selection still works, and no geometry changes.

**Checkpoint output:** implementation commit(s), passing `npm run check`, and `dist/mappo-0.1-dev.3fa.html` matching root `index.html` exactly.

## 3F-B — Read-only building information

**Goal:** Show meaningful existing information in the same selection inspector; no invented simulation data.

- [ ] Render display label/fallback ID, generated `type` and `shape`, footprint area, related district (if assigned), block, property, occupied plot count/IDs, and frontage road.
- [ ] Resolve linked records safely; give human-readable fallbacks for missing optional context and never mistake property usage for a custom building use.
- [ ] Support courtyard, row, compound wings, and multi-plot buildings without losing unique identities.
- [ ] Update inspector on selection and relevant non-geometric district edits, avoiding stale summaries.
- [ ] Keep UI readable in desktop, ultrawide, tablet, and narrow layouts; use textContent/safe DOM construction.
- [ ] Test references, multiple wings of one property, optional district membership, and null/missing-selection transitions.

**Acceptance:** each selected building displays accurate, stable facts from the accepted city, with no changes to its model.

**Checkpoint output:** implementation commit(s), passing `npm run check`, and `dist/mappo-0.1-dev.3fb.html` with root parity.

## 3F-C — Building name and descriptive use customization

**Goal:** Customize a building's identity without editing shape, placement, roads, or district structure.

- [ ] Add editable **custom name** (including clearing it back to the generated fallback) and **descriptive use** (suggested options: residence, inn/tavern, shop, workshop, guildhall, temple, warehouse, and custom/other).
- [ ] Keep generated `type` and `shape` read-only. A compound may have separately named wings; do not implicitly rename the property or other wings.
- [ ] Validate lengths, whitespace, valid use choices/free text, stale building IDs, and malformed imported metadata; reject invalid edits atomically and show local feedback.
- [ ] Use an explicit Apply/Save action and clear pending-edit feedback; do not silently overwrite accepted metadata as a user types.
- [ ] Add a small **building-only** undo/restore mechanism (e.g., bounded snapshots), with no interference in the existing outline, water, terrain, districts, or defenses histories.
- [ ] Preserve the selected building, its geometry, plot assignments, street access, and district on metadata-only commits.
- [ ] Warn clearly that **full city regeneration can replace individual buildings and their customizations**; never use reused sequential IDs to reattach old metadata to unrelated new footprints.

**Acceptance:** editing one building changes only its optional descriptive metadata, supports undo, and does not alter any other building or accepted geometry.

**Checkpoint output:** implementation commit(s), passing `npm run check`, and `dist/mappo-0.1-dev.3fc.html` with root parity.

## 3F-D — Persistence, compatibility, integration, and release candidate

**Goal:** Make inspector selection and per-building edits portable and backward compatible.

- [ ] Persist optional building metadata in the actual project record so `.mappo.json` downloads and browser recovery round-trip the edits.
- [ ] Persist valid building selection in optional `workspace.ui.selection` without making old saved files require new fields. Safely clear selection when its target is missing.
- [ ] Keep city project schema **9** and workspace schema **1** unless a contract-breaking issue is demonstrated and explicitly reviewed.
- [ ] Validate incoming metadata at the persistence boundary; preserve unknown compatible fields and exact accepted geometry during load/recovery. Confirm historical schema migrations still load.
- [ ] Test full save -> load -> inspect -> edit -> undo workflows, browser recovery, local district/defense changes, and full rebuild warning/reset semantics.
- [ ] Run the existing full regression suite and the actual standalone HTML smoke tests in **Firefox and Chromium** at 1440×900, 5120×1440, 768×1024, and 390×844. Report automated-versus-manual limitations.
- [ ] Check exact root/dist HTML parity, offline inline JS/CSS, no added runtime network requirements, version metadata, README and architecture/documentation updates.
- [ ] Open a review pull request against `main`; **wait for explicit merge approval**. Do not publish Pages without separate approval.

**Acceptance:** new and old project files load safely; edits survive download and browser recovery without regenerating geometry; other editors are unaffected; the release candidate passes CI and browser QA.

**Checkpoint output:** implementation commit(s), passing `npm run check` and browser verification, and `dist/mappo-0.1-dev.3fd.html` with root parity.

## Excluded from Milestone 3F

- Manual building footprint editing, resizing, rotation, relocation, or collision repair (**3G**).
- Building creation/removal or custom placement (**3H**).
- Street, property boundary, plot subdivision, or district-theme editing (**3I / later**).
- Economic simulation, occupations, NPCs, interiors, or 3D rendering.
- Unapproved alterations to the city's schema, generator architecture, existing defenses/water/terrain workflows, or public GitHub Pages.

## Release discipline

1. Build **3F-A → 3F-B → 3F-C → 3F-D** sequentially on this branch. At each checkpoint, run tests, record what was actually verified, commit source/tests/docs, and build a **compiled standalone HTML file**.
2. Preserve previous checkpoint distributions where practical; root `index.html` must always match the latest checkpoint output byte-for-byte.
3. Test both saved files and browser recovery, including older projects; explain remaining unsupported manual or touch checks rather than claiming unperformed coverage.
4. Do not merge, tag, or deploy until user approval. After 3F-D, propose a PR for review and keep 3G/3H separate.

## Proposed implementation entry points

- `src/app.js` — Canvas interaction routing, accepted project refresh, state capture/restore.
- `src/ui/workspace.js`, `src/ui/workspace-inspectors.js` — selection provider and inspector integration.
- `src/renderer/buildings.js`, `src/renderer/canvas.js` — hit feedback and overlay.
- `src/core/...` — pure building hit testing, metadata validation, bounded history.
- `src/data/project-format.js`, `src/data/project-validation.js` — optional persistence and compatibility.
- `tests/*.test.js`, `scripts/browser-qa.mjs` — regression and native browser coverage.

This is a **planning artifact**. No 3F functionality is implemented merely by committing this document.
