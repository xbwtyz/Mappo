# Mappo Milestone 3F — Property and Building Inspector

Status: **3F-A through 3F-D implemented and CI-verified; pull request #2 open for review, manual acceptance outstanding**.
3F-D verification: **205/205 Node tests, 16/16 browser-viewport checks** and exact standalone parity in [CI 44265027575](https://github.com/xbwtyz/Mappo/actions/runs/44265027575).
3F-C stabilization verification: **203/203 Node tests, 16/16 browser checks** in [CI 44263780267](https://github.com/xbwtyz/Mappo/actions/runs/44263780267).
3F-B verification: 193/193 Node tests, 16/16 browser cases, exact standalone parity. See [information Inspector QA](MILESTONE_3FB_QA.md).
3F-Aa verification: 185/185 Node tests, 16/16 browser cases, exact standalone parity. See [property-first QA](MILESTONE_3FAA_QA.md).
3F-A verification: 177/177 Node tests, 16/16 browser cases, exact standalone parity. See [checkpoint QA](MILESTONE_3FA_QA.md).
Branch: `feature/building-inspector-3f`, branched from `main` after the Phase 7 UI overhaul merge (`40e64fb`).
Baseline: `0.1-dev.ui7d`; accepted city project schema **9** and optional workspace UI schema **1**.
Owner approval: implement the ordered checkpoints below, using incremental commits, tests, and a compiled standalone HTML after each. **Do not merge into `main`, tag a release, or publish GitHub Pages without explicit approval.**

## Purpose and constraints

Use properties as the primary map selection and buildings as individually selectable children in the Inspector. Inspect existing attributes and later customize identity **without altering geometry or silently regenerating the city**. The user approved the property-first adjustment as **3F-Aa**, before 3F-B. See [the adjustment plan](MILESTONE_3FAA_PLAN.md).

Reuse the Phase 7 selection inspector (`src/ui/workspace.js` and `src/ui/workspace-inspectors.js`). Building records already have stable IDs within an accepted city (`BLD-...`), and contain `blockId`, `propertyId`, `plotIds`, `frontageRoadId`, `type`, `shape`, `footprint`, `holes`, `area`, `entrance`, `orientation`, and `roofTone`. The renderer already draws actual footprints and courtyard holes (`src/renderer/buildings.js`).

### Architectural rules

1. Separate **view selection** from **property/building metadata edits**. No generator or geometry coupling is needed to open an inspector.
2. Preserve generated `type`, `shape`, footprint, holes, property/plot references, roof information, and existing property `usage`. User-selected use is descriptive metadata, not a generator instruction.
3. Plan optional, bounded, validated identity fields on the **property** as the primary customizable site, with explicit per-building identity where needed. Do not duplicate or propagate names implicitly between a property and its structures. No identity fields are added in 3F-Aa; decide exact field representation and customization scope during 3F-C. Keep project schema 9 if this remains a backward-compatible addition; write a migration only if an actual data-contract change makes one necessary. Document the reviewed representation in 3F-C.
4. Property and building IDs are only stable **within the accepted city**. A full rebuild may reuse `PROP-...` and `BLD-...` IDs for different sites/structures. Do not transplant manual names/uses by matching generated ID after a rebuild. Make potential loss of customizations explicit before a full regeneration; local district and defense updates should retain them.
5. Respect active tool ownership: drawing/geometry tools keep precedence and their original independent undo histories. In Select/Pan, preserve landscape hit priority, then property selection before district/block; select individual buildings through the Property Inspector. Dragging remains pan. Properties require at least one visible development layer (buildings/properties/plots); hidden roofs cannot be selected as individual buildings.
6. Maintain a modular source + deterministic single-file offline HTML distribution, with no additional runtime dependencies. Preserve existing keyboard, mobile drawer, and accessibility behavior.

## 3F-A — Building selection and visual identity

**Goal:** Click a visible building on the map and open the shared Inspector with that building selected.

- [x] Add a pure hit-test for building polygons, respecting courtyard holes and nearby overlapping outlines; ensure predictable tie-breaking and appropriate tolerance at different zoom levels.
- [x] Integrate click selection only into the existing Select/Pan pathway: landscape first, then buildings, then district/block; empty space clears selection.
- [x] Register a `building` selection kind with the generic workspace shell; select by stable building ID, resolve against the current accepted project, and safely clear stale references.
- [x] Draw a distinct selected/hover outline in a renderer overlay without modifying the accepted footprint, other render layers, or view camera.
- [x] Keep selection consistent with Layers visibility, tool changes, panel collapse, gestures, and project regeneration; do not turn a drag into a click.
- [x] Add focused unit/integration tests for polygon holes, zoom, adjacent buildings, hidden layers, hit precedence, stale IDs, and interaction with district and landscape selection.

**Acceptance:** a house, compound wing or courtyard can be selected reliably from the Canvas, the correct record is highlighted, existing water/district selection still works, and no geometry changes.

**Checkpoint output:** implementation commit(s), passing `npm run check`, and `dist/mappo-0.1-dev.3fa.html` matching root `index.html` exactly.

## 3F-Aa — Property-first selection and child building navigation

**Approved adjustment:** implemented after 3F-A and before 3F-B. Map clicks on roofs, yards and courtyards select their property. The property boundary is highlighted and its Inspector lists the individually selectable buildings; a building view includes Back to property and a dashed parent boundary. Selection remains session-only; no geometry, generation, metadata or schema contract changes.

**Checkpoint output:** commits, regression and browser checks, and `dist/mappo-0.1-dev.3faa.html` matching root `index.html`. See [scope](MILESTONE_3FAA_PLAN.md) and [QA](MILESTONE_3FAA_QA.md).

## 3F-B — Read-only property and building information

**Goal:** Expand the property-first Inspector with accurate existing facts, retaining child building inspection.

- [x] Property view: readable label/fallback ID, generated usage, site area, district, block, constituent plot IDs/count, frontage road, and linked building count/IDs.
- [x] Building view: readable label/fallback ID, generated type/shape, footprint area excluding courtyard holes, occupied plot IDs/count, parent property, district/block and frontage road.
- [x] Resolve links safely with human-readable missing-context fallbacks; keep property usage separate from individual generated building type and any later custom use.
- [x] Support courtyard, row, compound wings and multi-plot sites, retaining individual identities and parent return navigation.
- [x] Refresh facts after relevant local changes without losing a valid property/building selection or regenerating accepted geometry.
- [x] Keep both views readable and safe in desktop, ultrawide, tablet and phone layouts; test shared properties, missing context and selection transitions.

**Checkpoint output:** implementation commits, passing `npm run check`, browser verification, and `dist/mappo-0.1-dev.3fb.html` with root parity. See [3F-B QA](MILESTONE_3FB_QA.md) for the verified results and limits.

## 3F-C — Property identity and independent building customization

**Approved:** the user requested continuing 3F-C after reviewing 3F-B. Implementation uses properties as primary sites and independently editable child identities.

- [x] Add optional per-record `customName` and `customUse` strings, 1–80 characters when present; clearing removes the optional field. Trim/collapse whitespace on Apply. Reject control characters, invalid types and oversized values atomically.
- [x] Expose name, preset descriptive uses and Other free text in the existing Inspector, behind an expandable identity editor. Generated property usage/building type/shape remain read-only. Never implicitly copy identities between a property and its buildings.
- [x] Use explicit Apply identity and Discard draft actions, per-record session drafts, local validation/pending feedback, and safe text rendering of accepted custom names.
- [x] Add an independent 20-entry property/building identity history holding metadata-only before/after snapshots. Preserve selected records and unrelated local changes. Route contextual Undo to identity while maintaining active-tool/native-text precedence.
- [x] Validate optional identity fields at the persistence boundary; accepted metadata round-trips through existing project files/recovery without a city/workspace schema change. History/drafts remain session-only in this checkpoint.
- [x] Confirm actual identity/draft loss before full generation and new street seed actions. Defer new seed assignment until confirmation, preserve identities/history on cancel or failed generation, and clear history/drafts after accepted project replacement or successful full rebuild. Never transfer identities by reused generated IDs.
- [x] Verify scope isolation, stale references, no-op edits, bounded history, reset semantics, save/load validation, UI navigation and browser workflows.

**Checkpoint output:** commits, passing `npm run check`, browser checks and `dist/mappo-0.1-dev.3fc.html` matching root `index.html`. See [3F-C QA](MILESTONE_3FC_QA.md).

## 3F-D — Persistence, compatibility, integration, and release candidate

**Goal:** Make property/building inspector selection and the identity edits agreed in 3F-C portable and backward compatible.

- [x] Keep accepted identity metadata portable; retain identity history and pending drafts only for the current session to prevent stale edits. Validate saved property/building selection in the existing schema.
- [x] Persist valid property or building selection in optional `workspace.ui.selection` without making old saved files require new fields. Safely clear selection when its target is missing.
- [x] Keep city project schema **9** and workspace schema **1** unless a contract-breaking issue is demonstrated and explicitly reviewed.
- [x] Validate incoming metadata at the persistence boundary; preserve unknown compatible fields and exact accepted geometry during load/recovery. Confirm historical schema migrations still load.
- [x] Test full save -> load -> inspect -> edit -> undo workflows, browser recovery, local district/defense changes, and full rebuild warning/reset semantics.
- [x] Run the existing full regression suite and the actual standalone HTML smoke tests in **Firefox and Chromium** at 1440×900, 5120×1440, 768×1024, and 390×844. Report automated-versus-manual limitations.
- [x] Check exact root/dist HTML parity, offline inline JS/CSS, no added runtime network requirements, version metadata, README and architecture/documentation updates.
- [x] Open a review pull request against `main`; **wait for explicit merge approval**. Do not publish Pages without separate approval.

**Acceptance:** new and old project files load safely; edits survive download and browser recovery without regenerating geometry; other editors are unaffected; the release candidate passes CI and browser QA.

**Checkpoint output:** implementation commit(s), passing `npm run check` and browser verification, and `dist/mappo-0.1-dev.3fd.html` with root parity.

## Excluded from Milestone 3F

- Manual building footprint editing, resizing, rotation, relocation, or collision repair (**3G**).
- Building creation/removal or custom placement (**3H**).
- Street, property boundary, plot subdivision, or district-theme editing (**3I / later**).
- Economic simulation, occupations, NPCs, interiors, or 3D rendering.
- Unapproved alterations to the city's schema, generator architecture, existing defenses/water/terrain workflows, or public GitHub Pages.

## Release discipline

1. Build **3F-A → 3F-Aa → 3F-B → 3F-C → 3F-D** sequentially on this branch. At each checkpoint, run tests, record what was actually verified, commit source/tests/docs, and build a **compiled standalone HTML file**.
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
