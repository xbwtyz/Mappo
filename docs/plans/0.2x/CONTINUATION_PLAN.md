# Mappo 0.2.x — 2D editor completion and usability plan

**Owner-approved strategic direction — November 23, 2026 (Pacific).** This is the durable continuation plan for the remaining 0.2.x development cycle. The owner approved the phased direction in conversation and requested this document before further development. Detailed milestone architecture, implementation, merge, schema changes and publishing still require their respective approvals under [AGENTS.md](../../../AGENTS.md) and the [development rules](../../contributing/development-rules.md).

## 1. Purpose and decision

Mappo has a substantially expanded 2D engine, but usability has deteriorated as more editing capabilities have been added. The owner explicitly wants the remaining core 2D features addressed during 0.2.x, rather than automatically pushing them to 0.3.

The approved approach is **functional usability first, remaining engine capabilities second, comprehensive UI polish last**. Do not do a cosmetic redesign now, and do not postpone all usability improvements until the engine is feature-complete. Build a reusable interaction foundation that future editors can adopt.

This plan is the forward-looking companion to the [engine limitations roadmap](ROADMAP_0_2X.md), which records existing milestones and evidence. It does not erase historical decisions, reopen completed work without evidence or replace the existing project rules.

## 2. Starting baseline (historical snapshot; verify on every resumption)

| Item | State at plan creation |
| --- | --- |
| Development build | 0.2.17-dev |
| Accepted project schema | 10; portable envelope 1; workspace 1 |
| Published stable release | v0.2.0 |
| Runtime main commit | `3540c393b42a58555541d3ed98ae9babf1582ef7` |
| Last runtime PR | [#143](https://github.com/xbwtyz/Mappo/pull/143), multipart PNG export fix, merged |
| Runtime CI | [Exact-main CI #45295533500](https://github.com/xbwtyz/Mappo/actions/runs/45295533500) passed; [PR CI #45293969133](https://github.com/xbwtyz/Mappo/actions/runs/45293969133) passed 604 Node tests and all six runners plus aggregate |
| Readiness reconciliation | [PR #144](https://github.com/xbwtyz/Mappo/pull/144) open at plan creation; [CI passed](https://github.com/xbwtyz/Mappo/actions/runs/45295886074); separate merge approval remains required |
| Known release blockers | None identified by the previous focused automated readiness pass; this is not proof that all usability or engine limitations are resolved |
| Release decision | No release or Pages deployment authorized; 0.2.x is not declared complete |

Schema 10 foundations, courtyard access, component editing, bounded same-building footprint joins, flexible parcels, road topology, chronological history and PNG export have been implemented. Issues [#121](https://github.com/xbwtyz/Mappo/issues/121) and [#122](https://github.com/xbwtyz/Mappo/issues/122) describe partially delivered capabilities with residual future scope. Other existing issue proposals remain separate; see the [limitations register](ENGINE_LIMITATIONS_REGISTER.md). Do not interpret green CI as owner UX acceptance.

## 3. Approved development sequence

Phase identifiers below are planning labels, **not assigned application version numbers**. Establish numbered milestones after the audit and dependency review. Relative complexity is preliminary, not a delivery-time promise.

| Phase | Goal | Complexity | Status |
| --- | --- | --- | --- |
| A0 | Comprehensive read-only UI/UX audit | Moderate | Source audit completed; hands-on measurements outstanding |
| A | Usability and interaction foundation | Moderate to high | [A1 merged](milestones/0.2.18-shared-selection-a1.md); [A2 merged](milestones/0.2.19-shared-input-a2.md); [A3 merged](milestones/0.2.20-unified-inspector-a3.md); A4–A5 merged; A6 automated acceptance reported passed, owner hands-on pending |
| B | Connected multi-segment road editing | High | [B1 0.2.23-dev](milestones/0.2.23-connected-road-groups-b1.md) merged, exact-main CI green. [B1R 0.2.24-dev](milestones/0.2.24-adaptive-reconciliation-b1r.md) merged in PR #153; exact-main CI green. |
| C | Water and terrain functionality | High to very high | Direction approved; detailed design pending |
| D | Settlement freedom: optional founder's square and dynamic perimeters | Very high | Direction approved; dependency discovery early |
| E | Comprehensive UI polish and integrated stabilization | Moderate to high | Direction approved; after remaining core capabilities |

Review founder's square and perimeter dependencies early in A0, even if implementation remains in Phase D. The order of B/C/D can be refined with owner approval if a demonstrated engine dependency requires it. Do not hard-code assumptions in A that obstruct later phases.

## 4. A0 — Comprehensive UI/UX audit (immediate next step)

**Problem:** The owner reports that usability is currently poor. Automated correctness tests alone do not establish whether a workflow is easy to discover, understand or perform.

**Scope:** Verify current main and inspect the actual desktop application, UI source, editor sessions, map interactions, existing documentation, test coverage and historical acceptance reports. Exercise representative Firefox/Chromium standalone workflows where execution is available. Distinguish observed behavior, source-derived findings and unverified hypotheses.

Audit inventory:

- Generation, Add and Roads tabs; project/layer menus; Inspector and all contextual panels.
- Building transforms, vertices, edges, courtyards, components, joins and compounds; property creation, splitting, merging, frontage and plot editing.
- Road selection, junctions, segments, paths, access repair and protected infrastructure.
- Lake, river, waterfront, terrain and fortification editing; generation boundaries, founder's square and settlement perimeter controls.
- Map targeting, selection, hover, hit testing, handles, dragging, snapping, camera, zoom/pan, keyboard and numeric input.
- Draft entry, live preview, Apply/Cancel/Reset, stale selection, invalid edits and error recovery.
- Undo/Redo, save/load, browser recovery, PNG output and offline behavior.
- Desktop/laptop/ultrawide layouts, panel density, discoverability, navigation, focus and responsiveness.

For each representative task record starting state, steps/clicks, expected outcome, actual behavior, confusing or redundant controls, meaningful latency where measured, severity, evidence, likely source modules, suggested correction and dependencies on B/C/D. Use deterministic seeds and fixture IDs where appropriate. Include supported and legitimately rejected edits. Do not loosen a valid safety rule merely to reduce refusals.

Classify findings into **interaction architecture**, **workflow friction**, **feedback/diagnostics**, **visual/layout polish**, and **engine limitation**. Rank by severity and frequency/user impact where evidence exists. Use P1 for workflow blockers, P2 for material friction, P3 for lower-priority refinements; mark unmeasured frequency as unknown. Avoid inventing issues or benchmarks.

**Deliverables:** a workflow/panel inventory, prioritized findings, reproducible examples, current-versus-proposed interaction patterns, architecture decision choices and recommendations, a dependency-aware milestone proposal and measurable acceptance criteria. Present to owner before modifying runtime or opening implementation PRs. The audit itself is read-only; any repository write beyond the approved planning document needs appropriate authorization.

## 5. A — Usability foundation (before feature expansion)

Focus on behavior and consistency, not final colors, typography, decorative animation or a wholesale visual redesign.

| Workstream | Intended direction |
| --- | --- |
| Selection | Reusable selection model for single and multiple objects; define additive/toggle selection, compatible sets, selected-state rendering and clear selection |
| Inspector | Consistent context-sensitive actions and common control layout across entity types, preserving map context |
| Editing | Shared interaction patterns for translation/rotation/resize where supported, handles, precise input, snapping, drafts and explicit Apply/Cancel/Reset |
| Feedback | Visible, actionable diagnostics; identify affected records and distinguish impossible edits, unsupported capabilities and correctable constraints |
| Efficiency | Reduce unnecessary clicks and redundant instructions, provide discoverable shortcuts, keep keyboard and pointer behavior consistent |
| Extensibility | Shared UI abstractions coordinate existing domain editors; do not duplicate geometry validators or impose unsafe generic transforms |

Maintain the canonical Generation/Add/Roads workspace unless an explicitly approved information-architecture decision changes it. Design selection and shared controls so future road groups, water/terrain and other features can use them. The selection architecture must not implicitly authorize multi-object writes, mixed-domain transformations, deletion or new persistent schema state.

**Detailed decisions before implementation:** selection ownership/lifetime, allowed homogeneous/mixed selections, active editor and input routing, compatibility of common controls with domain constraints, preview and diagnostics contract, history granularity, keyboard conflict rules, interaction with existing panels, migration of existing UI components and measurable before/after task benchmarks.

**Acceptance direction:** existing workflows remain supported; consistent controls and errors; no draft mutation; appropriate keyboard/focus behavior; measured reductions in identified friction; no performance or offline regressions; validated behavior in both desktop engines. Obtain owner approval of actual architecture and milestone gates first.

### A6 — Cross-editor history and save acceptance

Use a deterministic Schema 10 city that has compatible district and defense restore snapshots from an earlier save. Choose one road reflow that reshapes nearby parcels or routes and changes a district dependency. Apply a district edit, a defense edit, and the road reflow. Record the accepted project and affected workspace snapshots after each Apply.

1. Undo the three edits in reverse and redo them in Apply order. Compare the accepted city at every step, including IDs, district membership, walls, gates, towers, parcels and entrance/access routes. The road reflow and its dependent edits count as one transaction.
2. Compare the saved district snapshot stack on each side of the road edit. When reflow makes a snapshot incompatible, Undo restores that snapshot with the prior topology and Redo restores the compatible stack for the reapplied topology.
3. Export and reopen the tested state. Verify full project parity and compatible saved district and defense restore actions. Restore each snapshot through the History panel, verify the resulting accepted data, and Undo/Redo that restore in the new session.
4. Run the scenario from the offline standalone in both desktop browser engines. Report fixture seed and IDs, the first mismatching state if any, and the owner hands-on result separately from browser automation.

## 6. B — Connected multi-segment road editing

**Owner-requested capability:** Select multiple connected road segments and move them together.

Design connected subgraph selection (segments, shared junctions, endpoints) and an atomic group transform. Define what happens at attachments to unselected roads, at boundaries and protected infrastructure. Decide whether groups are transient selections or persistent structures; default to transient until a reason for persisted state is established.

Investigate graph connectivity, junction identity, intersections, face lineage, affected property/plot geometry, entrances, courtyard routes, bridges and authored/protected features. Present a bounded first scope, explicit unsupported cases and user-facing conflict handling. No blind full-city regeneration or silent loss of authored work.

**Acceptance direction:** deterministic connected selection, coherent group movement, valid external connections or explicit refusal, independent candidate validation, stable IDs, protected feature preservation, one atomic history transaction, save/reopen and offline Firefox/Chromium coverage. At validated Apply, supply one explicit history transaction with a label and the selected road IDs. It owns every dependent geometry and workspace change from that Apply. Subsequent road capabilities such as true curves or disconnected networks are not implicitly included.

## 7. C — Water and terrain expansion

### C1 — Lakes, waterfronts and rivers

**Owner-requested capability:** Better lake, waterfront and river functionality.

Audit existing water models, shoreline/bank topology, river paths and widths, lake shapes, coastal transitions, placement and editing, and dependencies on roads, bridges, parcels, access, fortifications and settlement extent.

Define useful workflows and scope with owner: direct manipulation, shape/vertex/path editing, creation/removal, confluences or boundary interactions where supported, and waterfront development/access. These are candidate design questions, not commitments to every operation. Prefer reusable interaction controls from Phase A.

**Acceptance direction:** deterministic valid water geometry; safe handling of affected roads and development; explicit dependency decisions; no orphaned bridges or impossible access; reversible edits; accurate rendering/export and portable save/reopen.

### C2 — Mountains, hills and rocks

**Owner-requested capability:** Better mountain, hill and rock feature functionality.

Audit terrain representation, generation, placement, shape editing, scale, orientation, visibility and exclusion/clearance rules. Review road, building, water and perimeter dependencies. Distinguish editable terrain regions from decorative or point assets. Determine how 2D geometry can support future derived 3D without assuming a height schema is already approved.

**Acceptance direction:** intuitive supported placement and transforms, correct terrain interactions, predictable refusal for unsafe edits, preservation of authored geometry, atomic history, offline persistence and rendering. Any persistent elevation or new asset representation requires its own data-contract review.

## 8. D — Settlement freedom

### D1 — Remove mandatory founder's square requirement

**Owner-requested capability:** A city should not require a founder's square.

Review all current generation, validation, face/plaza, road graph, district, rendering, export, save/migration and UI dependencies. Separate a useful optional plaza from a required architectural anchor. Determine what replaces mandatory origin/anchor assumptions in cities without a square. Preserve existing authored plazas.

**Acceptance direction:** generate and edit valid cities without mandatory founder's square; existing square-bearing cities remain valid under the approved compatibility policy; validators, routing, rendering, export and saves handle absence safely. No accidental deletion, synthetic placeholder masquerading as user content or silent reinterpretation of authored records.

### D2 — Dynamic perimeters

**Owner-requested capability:** Dynamic settlement perimeters.

First define the meaning of perimeter: editable survey boundary, developed settlement extent, wall/fortification envelope, or distinct concepts with explicit relationships. Decide whether users can expand, contract or reshape each and how generation/validation responds. Audit dependency on founder's square, roads, terrain, water, district coverage, parcel ownership and walls/gates.

**Acceptance direction:** bounded deliberate perimeter changes; preserved authored work and stable identities; explicit handling of newly included/excluded land and connected infrastructure; valid water/terrain/road/parcel relationships; atomic Undo/Redo, export bounds and save/reopen. No automatic destructive regeneration. Any schema/format changes require separate approval.

## 9. Additional 2D capability review (candidate backlog)

The following were raised as areas worth reviewing, not as approved implementation scope or mandatory release blockers:

- Multi-object selection/movement/deletion beyond the connected road task.
- Manual bridges, walls and gates; manual districts.
- Undeveloped land and open spaces; finer procedural regeneration control.
- Waterfront properties and development.
- Non-building environmental assets such as trees and fences.
- Improved snapping/alignment and local editing that preserves nearby development.

Inventory existing support before proposing new work. Associate confirmed gaps with existing issues where possible, avoid duplicates, and obtain owner prioritization. Existing deferred road network, protected infrastructure, spline, large-scale reflow, performance, import-capacity and residual Schema 10 proposals retain their current approval/evidence boundaries.

## 10. E — Comprehensive UI polish and final 2D acceptance

Only after the remaining approved core engine milestones are implemented, revisit overall information architecture, visual cohesion, layout, typography, hierarchy, panel density, discoverability, shortcuts and end-to-end workflow optimization. Earlier low-cost visual fixes are fine within an approved scope, but avoid repeated full redesigns as editor capabilities evolve.

Run final cross-editor desktop acceptance with representative small/large and authored mixed cities, real offline save/recovery/export and history, negative safety cases and measured responsiveness on meaningful workflows. Obtain owner hands-on feedback and approval. Reconcile unresolved issues as defects, deliberate limits, or future features; do not call the engine universally complete.

A future 0.3 direction is a separate product decision. The 2D source of truth and modular data contracts must remain suitable for future derived 3D; this roadmap does not authorize a 3D editor or preselect the 0.3 feature set.

## 11. Standing implementation and release gates

Follow [AGENTS.md](../../../AGENTS.md), [development rules](../../contributing/development-rules.md) and [CI policy](../../contributing/ci-policy.md). In particular:

1. Verify current main, open PRs/issues and exact-head CI; present scope, architecture choices, trade-offs, relative complexity and acceptance checkpoints.
2. Obtain separate approval for each detailed implementation milestone; fresh focused branch, modular authoritative source, deterministic compiled standalone, no external runtime dependencies.
3. One authoritative accepted city; isolated drafts; independent validation; atomic Apply/Undo/Redo; preserve IDs, authorship, unknown metadata and protected infrastructure.
4. Keep existing schema and supported migrations unless a separately approved change defines contract and upgrade policy.
5. Target desktop Firefox/Chromium and keyboard/mouse/trackpad; targeted tests during work, six-runner CI and aggregate gate on exact PR head and main. Heavy C7 remains opt-in; no CI-policy change authorized here.
6. Present user-facing before/after, evidence, limitations and PR/CI links; separate explicit merge approval; verify post-merge CI.
7. Public release version, notes, compatibility, tag and guarded publishing require separate authorization; Pages separately authorized. No release is automatically triggered by completing a phase.

## 12. Continuation instructions for a new conversation

Read this document, [AGENTS.md](../../../AGENTS.md), [development rules](../../contributing/development-rules.md), [0.2.x roadmap](ROADMAP_0_2X.md) and any newer accepted milestone documents. Verify live repository status rather than treating this snapshot as current truth. Use the decision log for previously approved architecture.

The owner's approved direction is A0 audit → A usability foundation → B connected roads → C water/terrain → D settlement freedom → E final polish, subject to approved dependency refinements. B1 is merged with exact-main CI green. PR #153 merged; exact-main CI green. P4 8ms timing target remains open. A6 owner hands-on acceptance remains pending. B2 is deferred.

Update this document as phases are approved/completed or the owner changes direction. Record links to relevant issue/PR, exact verification evidence and the next approval boundary; keep historical snapshots distinguishable from live state.

Next approved implementation: [B1R-E spatial recovery](milestones/0.2.25-spatial-recovery-b1r-e.md), beginning with E1/P1. B2 deferred and A6 hands-on acceptance separate.
