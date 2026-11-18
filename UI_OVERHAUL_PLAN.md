# Mappo UI overhaul — goals and acceptance checklist

Status: Phases 1–3 and 4A–4B implemented; Phase 4C cross-workflow integration implemented on the feature branch (`0.1-dev.ui4c`), with automated validation pending. Phases 5–7 and later 3F building inspector remain planned. This document records the agreed direction and the refinements proposed after the mockup review. Further implementation follows discussion and approval.

Baseline: Mappo `0.1-dev.3e6`, project schema 9. The UI overhaul comes before the planned 3F building inspector. The first UI implementation build is `0.1-dev.ui1`; accepted city schema remains 9.

## Goal

Make everyday editing easier through readable controls, a larger map, clear selection, and fewer interruptions. Keep the parchment map and dark editor styling, modular source, offline operation, and single-file HTML distribution.

Visual/interaction reference: [interactive UI mockup](https://chatgpt.com/library?file_id=libfile_34a52d1585188191a026c225f458cc0a&account_id=personal). The mockup illustrates layout and interaction; production must use the live Canvas renderer, real feature records, existing geometry editors, and actual generation/save behavior.

## Where controls belong

| Area | Responsibilities |
| --- | --- |
| Top bar | Project menu, section navigation, persistent Rebuild city action, pending-change count |
| City | Outline, starting shapes, main square, street pattern/density, expandable generation settings |
| Landscape | Water/mountain filters, independent feature list, Add feature action |
| Districts | Neighborhood list, district generation, connected block membership tools |
| Defenses | Wall enable setting, gate/tower settings, defense-only updates |
| Selection inspector | Relevant controls for the selected landscape feature or district; an extension point for the later building inspector |
| Map toolbar | Select, Pan, Fit, zoom, context-labeled undo, unified Layers menu |
| Context/status area | Active tool instruction, selection identity, draft/error feedback, rebuild consequences |

## Phase 1 — Modular workspace and navigation

- [x] Create a workspace-shell controller for section navigation, panel visibility, and inspector pinning.
- [x] Provide City, Landscape, Districts, and Defenses sections; show one section's controls at a time.
- [x] Open City by default for a new workspace.
- [x] Keep the map central and allow both side panels to collapse.
- [x] Collapse the inspector when nothing is selected; open it on selection. Support pinning it open.
- [x] Keep selection state, navigation state, and panel layout separate from generation and geometry modules.
- [x] Use reusable inspector sections so the later building inspector can join the same shell.

Acceptance: the main city tools are immediately available; switching sections changes the visible controls without regenerating the city or discarding completed drafts. Empty inspector space is available to the map unless the panel is pinned.

Phase 1 scope: existing editing forms remain in their respective sections. Inspector providers currently supply live read-only summaries and a shortcut to those controls. Full landscape selection/listing, inspector forms and persisted shell preferences remain assigned to later phases. See [WORKSPACE_UI.md](WORKSPACE_UI.md).

## Phase 2 — City, Project, and Layers organization

- [x] Put outline, center, street pattern, and density controls together under City.
- [x] Keep drawing methods and starting-shape presets easy to discover without exposing every option at once.
- [x] Move seeds and less-used generation options into expandable Generation settings sections.
- [x] Move Download project, Load project, and recovery/backup actions into a Project menu.
- [x] Retain validated load preview and explicit Open project behavior.
- [x] Consolidate building, property, plot, district, and fortification visibility settings into one Layers menu.
- [x] Keep Select, Pan, Fit, and zoom accessible from every section.
- [x] Replace decorative sidebar headlines and repeated paragraphs with concise labels and active-tool guidance.

Acceptance: users can shape the city, manage files, and change visibility without searching a long sidebar. Every existing option has a documented new home and retains its current behavior.

Phase 2 scope: the City panel is compact, seeds live in local expandable settings, Project is a shared top-bar menu, all seven visibility fields share Layers, and the map rail exposes the existing combined Select/Pan interaction, Fit and zoom. The validated file preview and explicit Open project are unchanged. See [UI_CONTROL_MAP.md](UI_CONTROL_MAP.md) for every existing control family's new home.

## Phase 3 — Landscape list and selection inspector

- [x] Show the river, coast, individual lakes, and individual mountain ranges in one selectable feature list.
- [x] Offer All, Water, and Mountains filters.
- [x] Identify features by stable record ID; use existing names or readable fallback labels.
- [x] Provide one Add feature entry point, with the creation form opening in the inspector.
- [x] Show only the selected feature's shape, movement, generation, crossing, and removal controls.
- [x] Retain river/coast independence, multiple lakes/ranges, current limits, and feature-specific geometry guidance.
- [x] Select features directly from the map in Select/Pan mode; make hit priority and clearing selection predictable.
- [x] Highlight and reveal the matching list entry when a feature is selected on the map.
- [x] Add clear hover and selected outlines, including when features are small or close together.
- [x] Preserve selection by ID after applicable regeneration, undo, and load operations; clear missing selections safely.

Acceptance: users can select a lake or range from either the map or list and edit it through the same inspector. Editing or removing one feature preserves unrelated features. Live geometry and actual generation replace all simulated mockup actions.

Phase 3 scope: the live Landscape list and inspector reuse the original water/terrain controllers. Selection uses draft record IDs, predictable map hit priority and hover/selected halos. A bounded optional `view.landscapeSelection` restores existing selected records even in Select/Pan; missing references clear safely. Full shell preferences, filters, creation-form state and portable per-feature input caches remain Phase 6.

## Phase 4 — District and defense workflows

- [x] Move district name/color and connected block membership controls into the district inspector (4A).
- [x] Keep neighborhood generation settings in Districts and district display switches in Layers (4A).
- [x] Group wall enablement, requested gates, tower spacing, and defense generation settings under Defenses.
- [x] Label local updates clearly: Apply district changes, Rebuild districts, and Update defenses.
- [x] Preserve geometry when applying district-only or defense-only changes, following the existing contracts.
- [x] Reuse the current district and fortification controllers and validators through modular UI adapters.

Acceptance: local updates remain visibly distinct from a full city rebuild. District membership connectivity, gate/street connections, water/mountain openings, and scoped histories continue to work.

## Phase 5 — Draft feedback, undo, and fewer interruptions

- [ ] Keep Rebuild city visible across all sections.
- [ ] Show a trustworthy pending-change summary based on real outline, street, water, and terrain drafts/settings.
- [ ] Explain rebuild effects inline: streets, buildings/properties, districts, and enabled defenses regenerate; customized district data can be replaced.
- [ ] Keep routine rebuilds direct and creation forms inline; reduce modal dialogs used only to expose settings.
- [ ] Keep existing staged project loading and recovery decisions explicit.
- [ ] Label undo according to the active editor and preserve its existing history boundaries: outline, water, terrain, districts, or defenses.
- [ ] Make apply/rebuild, revert, and undo outcomes clear in the relevant status area.
- [ ] Place validation errors near the relevant feature or setting and preserve the last valid city on failure.
- [ ] Show one concise instruction for the active tool; place longer explanations in expandable help.
- [ ] Preserve each section's selection and scroll position when navigating away and back.

Acceptance: users can tell what is selected, which tool is active, which drafts are pending, what a rebuild changes, and which edit Undo will restore. Navigation and panel collapse leave edits intact.

## Phase 6 — Readability, responsive layout, and workspace persistence

- [ ] Increase primary control/label readability; target approximately 13–14 px text and 36–40 px control heights where practical.
- [ ] Strengthen heading contrast, hover feedback, focus rings, and selected-tool states.
- [ ] Keep controls labeled and keyboard accessible; use icon-only buttons only with accessible names/tooltips.
- [ ] Preserve Escape, Delete, Ctrl/Cmd+Z, Space-drag, zoom, and Fit behavior without intercepting normal text entry.
- [ ] Retain gesture cancellation and prevent a hidden/inactive editor from handling map input.
- [ ] Adapt the panel layout for ordinary desktops, a 32:9 ultrawide display, and narrow screens while keeping map access available.
- [ ] Save/restore active section, panel collapse/pin states, relevant selections, and pending inputs alongside the existing editor drafts/history.
- [ ] Define additive workspace fields with safe defaults for older saves; preserve unknown compatible data.
- [ ] Keep accepted city geometry authoritative on load and browser recovery.

Acceptance: the workspace is readable and navigable across supported layouts, and save/load/recovery restore the intended UI state without changing saved geometry. Older projects open with sensible navigation defaults.

## Phase 7 — Integration, regression checks, and release

- [ ] Check the complete old-to-new control inventory against the working 3E.6 build.
- [ ] Add focused UI/state tests for navigation, selection, tool routing, panel behavior, draft counts, undo scope, and workspace round trips.
- [ ] Run the existing geometry, water, terrain, district, defense, and persistence regression suite with `npm run check`.
- [ ] Exercise the actual standalone HTML through outline editing, all landscape types, crossings, local updates, full rebuilds, save/load, and recovery.
- [ ] Perform graphical browser checks in Firefox and Chrome, including desktop, ultrawide, and narrow layouts.
- [ ] Verify collapsed panels resize the live map correctly and that there is no inaccessible overflow or focus trap.
- [ ] Verify one self-contained offline HTML file, with identical root `index.html` and current distribution output.
- [ ] Update version metadata, README, UI architecture notes, persistence documentation, and QA results for the completed implementation.
- [ ] Discuss the completed UI and any remaining issues before moving on to 3F building inspection.

Acceptance: the reorganized editor supports every current feature, all appropriate checks pass, browser verification limits are reported honestly, and the release remains modular and expandable.

## Implementation order and review checkpoints

Work in the phase order above. Each phase is a reviewable implementation chunk. Discuss upcoming implementation scope before application changes, then work within the scope approved by the user. Adjust dependencies as needed, and record changes here so this checklist remains the reference.

- Planning/documentation: committed reference checklist.
- Phase 1: implemented with focused workspace tests, the existing regression suite and Chrome graphical checks; native Firefox verification remains pending.
- Phase 2: implemented with 129 passing automated tests and Chrome menu, recovery preview/cancel, layer and shared map-control checks.
- Phase 3: implemented with 135 passing automated tests, focused final integration checks and Chrome creation, map/list selection, filters, removal/undo and explicit file-load checks.
- Phase 4A: new Districts inventory with contextual district editing, using the existing controller, selection and scoped undo; automated suite passed (138 tests).
- Phase 4B: grouped Defenses settings, pending-change guidance and explicit local update; `npm run check` passed 141/141 tests on GitHub Actions. Root/index distribution parity checked by `git diff --exit-code`. Native Firefox and broader screen-size verification remain open for Phase 7.
- Phase 4C: combined district and defense edits now have a shared integration regression covering atomic invalid inputs, scoped undo after project reload, and exact city geometry preservation; map selection now scrolls to the corresponding district list item. Acceptance awaits complete automated checks; native Firefox and responsive graphical checks are Phase 7 tasks.
- After the UI overhaul: resume the planned 3F building inspector within the new inspector architecture.

Mark checkboxes complete only after the corresponding production behavior has been implemented and verified. A visual mockup alone does not complete an implementation goal.
