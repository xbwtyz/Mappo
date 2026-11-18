# Workspace UI architecture

The `0.1-dev.ui5a` feature-branch build implements Phases 1–4 plus Phase 5A of `UI_OVERHAUL_PLAN.md` around the existing working editor. The map still renders the live city through Canvas; generation, geometry, district and defense rules stay in their existing modules.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `core/workspace-state.js` | Four section definitions, pure navigation/selection transitions and derived inspector visibility |
| `ui/workspace.js` | Tabs, panel collapse/pinning, focus routing, layout-change notification and generic inspector rendering |
| `ui/workspace-menus.js` | Shared nonmodal Project/Layers panels, focus/dismissal and project-status attention adapter |
| `ui/workspace-inspectors.js` | Read-only adapters from current district/water/terrain records to inspector descriptors |
| `core/landscape-selection.js` | Pure draft-record inventory, readable labels, polygon adapters and deterministic map hits |
| `ui/landscape.js` | Keyed feature list, filters, creation/selection routing, contextual form visibility and runtime input cache |
| `ui/district-workspace.js` | Keyed neighborhood list, list/map selection synchronization and contextual district form visibility without geometry ownership |
| `renderer/landscape-selection.js` | Canvas hover and selected halos independent of feature generation |
| `app.js` | Connect existing editors to shell selection, cancel tools leaving a section and resize the live Canvas |
| `index.template.html` | Stable DOM controls grouped under four tabpanels, inspector slots and shared generation action |
| `styles/app.css` | Workspace tracks, collapsed panel behavior, responsive panel placement and accessible control states |

## Navigation and layout

A new workspace opens City with the tools visible and the inspector collapsed. Landscape, Districts and Defenses each reveal their own section without recreating its DOM. Pending field values therefore remain attached to the existing controllers. Tabs support arrow keys, Home and End; inactive panels are hidden and inert. Buttons remain individually labeled.

Both side panels can collapse. Explicit grid placement keeps the Canvas in the map track when either side is hidden. The shell notifies the existing resize routine when panel visibility changes, including environments without ResizeObserver. Resizing updates viewport dimensions while preserving camera position and zoom, accepted geometry and feature definitions. Small screens use side-panel overlays so collapsing controls leaves an accessible map.

Navigation cancels an active gesture belonging to the section being left, using that editor's existing cancellation behavior. It then stops that section's tool. Completed definitions, dirty flags, input controls and geometry histories stay with their existing editors. A newly activated tool entering its own section is retained. Collapsing a panel leaves the active map tool usable.

## Selection and inspector extension

Shell selection is a small `{kind, id}` reference, separate from generated records and editor histories. The inspector opens for an explicit selection, remains closed if manually collapsed during subsequent automatic refreshes, and reopens for a fresh explicit selection. A pinned inspector stays open without a selection and offers the expandable city report. Clear selection stops active editing and clears district highlights; it leaves geometry and completed drafts intact. Removed records clear stale inspector selection safely.

Providers register by kind with a `resolve(id)` function. They return a descriptor containing `type`, `title`, `description`, an optional target `section`/`controlLabel`, and reusable `sections` with a title and label/value rows. Text is rendered through textContent. The shell does not import feature generators or mutate records. Tests demonstrate registration of an additional building provider without changing the shell; the actual 3F building inspector remains future work.

Current providers resolve district selection, water tool/feature selection and mountain tool/feature selection against the existing records. They show live summaries and an Open controls shortcut. Water/terrain forms now live once in the inspector, retaining their original IDs and event bindings. The landscape adapter shows one feature group at a time; Phase 4A moves the existing district form to the same inspector and adds a separate keyed neighborhood list in Districts. The shell exposes a generic onInspect callback without importing feature geometry.

## Persistence and verification

Project schema 9, workspace schema 1 and container format 1 remain unchanged. Phase 3 adds only an optional bounded landscape reference in view.landscapeSelection; full shell preferences remain later work. Existing city geometry, unfinished drafts, controls and editor histories continue to load/save unchanged. Restored active editor modes reveal the corresponding controls; new workspace navigation defaults remain sensible for older files. Phase 6 owns portable shell preferences.

Focused tests cover initial state, tab visibility/focus, panel collapse, selection/pinning, invalidated records, reusable providers, safe text rendering and read-only record adapters. The compiled app checks completed draft/history/input preservation across all sections, cancellation of an in-progress water gesture, real inspector selection, pin/clear behavior and save/load compatibility. Graphical Chrome checks cover actual Canvas resizing and absence of page overflow with both side panels collapsed. Native Firefox and the wider responsive/ultrawide matrix remain later verification checkpoints.

## Phase 2 organization

`WorkspaceMenus` manages presentation only: one open menu, keyboard entry, Escape/outside/focus dismissal and safe focus transfer. `ProjectFiles.onStatus` reports existing validated-load/recovery/error state; it does not delegate file parsing, applying or persistence to the menu. New staged previews and errors reveal Project even after asynchronous file selection. Passive recovery/status updates mark the opener without repeatedly reopening dismissed previews.

All seven existing visibility controls move intact to Layers, retaining their IDs, render bindings and saved workspace fields. The original combined Select/Pan control moves to the shared map rail alongside Fit and zoom. Seeds and optional City shapes use native details/summary controls. Summary keyboard activation is excluded from map shortcuts. New menu/disclosure state stays runtime-only until Phase 6. See [UI_CONTROL_MAP.md](UI_CONTROL_MAP.md) for the full control-family inventory.

## Phase 3 landscape behavior

The inventory reads draft editor features, so new/removed shapes appear immediately without changing accepted city data. Keys combine kind and stable ID. Rows survive hover, selection and input refreshes without replacing their buttons. Selecting a map feature resets a conflicting filter to All and scrolls the row into view. Inspecting does not activate a shape editor; original editing buttons still own modes and validation. Selecting a different feature cancels gestures through the original editors and clears district highlights.

The creation picker uses the same mounted controls, showing creation fields and actions for one type. Singleton river/coast availability and lake/range limits derive from current records. Successful creation switches to that actual new record; validation errors stay beside the form. Shape/bridge/pass controllers keep their existing identities, composition checks, scoped histories and generation behavior. The adapter remembers raw fields per feature during the running session, including removal/undo. The selected feature's raw controls remain portable through existing fields; unselected cached fields and creation presentation remain runtime-only until Phase 6.

Map hit testing uses an eight-CSS-pixel edge tolerance divided by zoom. Edges beat interiors, nearest edges win, smaller interior footprints win, and stable IDs break exact ties. Coastal interiors use the ocean polygon while coastal edge selection/highlights use the actual shoreline. Landscape hits precede district block hits; empty land clears the selection. Pointer movement only updates hover in Select/Pan and never edits geometry. Renderer halos use constant screen widths to stay visible around small features.

Editor callbacks reconcile selection by ID. Missing selected records clear without selecting an arbitrary replacement. Undo retains a still-valid selected record even if its snapshot held another active ID. Full rebuilds preserve IDs where the original generators do. Loading resolves the optional landscape reference against restored draft records, clears missing IDs and never regenerates saved geometry. Older saves retain the existing active-mode fallback. Inspector scroll resets for a different selection and remains stable during edits.

## Phase 4A district list and contextual editing

The district adapter reads authoritative accepted districts, creates stable keyed rows and mirrors the original `DistrictEditor` selected district ID. Map block clicks and list buttons select the same district, open Districts and reveal the contextual right-hand form. The existing district panel continues to own generation, input validation, membership propagation, 20-history undo, and failure messages. Rebuild and undo stay in Districts; name/color and block transfers live in the inspector; layer visibility stays in Layers. No generator, validation or schema logic changed.

The district panel retains pending name and color inputs when the selected district stays the same (including clicking other blocks in it) but restores accepted values when the selection changes or a local mutation succeeds. The receiving-district input retains a pending target only while the selected block and target remain valid. The existing saved single-selected-district control values remain authoritative for portable files; portable per-district input caches belong to Phase 6.

## Phase 4B defense-only controls and update preview

The original `FortificationPanel` remains authoritative for applying defense changes and its separate ten-snapshot history. A pure presentation helper (`describeDefenseUpdate`) normalizes enabled settings with the existing fortification normalizer to describe whether **Update defenses** builds the first walls, regenerates defenses after changed settings, disables walls while retaining geometry, re-enables saved records or makes no change. When walls are disabled, pending invalid numeric settings do not prevent disabling or delete existing defense records. Pending validation guidance appears inline without attempting generation or modifying accepted data.

The grouped Defenses panel keeps all existing control IDs. It separates wall enablement, gate/tower targets, optional defense seed and the apply/undo actions. Layer visibility continues to live exclusively in the shared Layers menu. Restoring saved pending controls re-renders the preview after assigning their stored values; it never regenerates or repairs loaded walls. Existing city geometry, districts, water and terrain remain unchanged by defense-only apply/undo, per original model validators.

## Phase 4C district/defense integration

Map block selection now calls the district workspace's list-row reveal hook after the shell has synchronized the selection. This scrolls the corresponding keyed neighborhood row into view without recreating it, changing map geometry or triggering extra selection events. List selection still routes through `DistrictPanel` and its existing editor. The compiled app's integration regression exercises the actual shared UI controllers in order: generate districts, reject an invalid rename without changing the model/history, apply a valid rename/recolor, build defenses, reject invalid tower spacing atomically, regenerate defenses from a new seed, save both histories in one portable file, restore the accepted city without generation, then undo each editor's changes independently back to the starting city. Full city regeneration remains a separate explicit action. No persisted fields or schema versions are added.

## Phase 5A read-only pending state

`core/pending-changes.js` compares the authoritative accepted outline/main square with the current editor geometry, compares accepted street settings and tracks water/terrain draft dirty flags. Unapplied district fields and fortification previews are presented separately as local updates. The adapter is read-only, never causes generation or changes history, and adds no fields to the project format. A count is shown in the top bar and an expandable rebuild-effects guide is permanently accessible beneath the section tools.
