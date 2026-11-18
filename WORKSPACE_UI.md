# Workspace UI architecture

The `0.1-dev.ui1` build implements Phase 1 of `UI_OVERHAUL_PLAN.md` around the existing working editor. The map still renders the live city through Canvas; generation, geometry, district and defense rules stay in their existing modules.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `core/workspace-state.js` | Four section definitions, pure navigation/selection transitions and derived inspector visibility |
| `ui/workspace.js` | Tabs, panel collapse/pinning, focus routing, layout-change notification and generic inspector rendering |
| `ui/workspace-inspectors.js` | Read-only adapters from current district/water/terrain records to inspector descriptors |
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

Current providers resolve district selection, water tool/feature selection and mountain tool/feature selection against the existing records. They show live summaries and an Open controls shortcut. Existing forms retain their original IDs and event bindings in their respective sections. Landscape map hit testing, the combined feature list and full inspector forms are later UI phases.

## Persistence and verification

This phase adds no persisted shell fields and keeps project schema 9, workspace schema 1 and container format 1. Existing city geometry, unfinished drafts, controls and editor histories continue to load/save unchanged. Restored active editor modes reveal the corresponding controls; new workspace navigation defaults remain sensible for older files. Phase 6 owns portable shell preferences.

Focused tests cover initial state, tab visibility/focus, panel collapse, selection/pinning, invalidated records, reusable providers, safe text rendering and read-only record adapters. The compiled app checks completed draft/history/input preservation across all sections, cancellation of an in-progress water gesture, real inspector selection, pin/clear behavior and save/load compatibility. Graphical Chrome checks cover actual Canvas resizing and absence of page overflow with both side panels collapsed. Native Firefox and the wider responsive/ultrawide matrix remain later verification checkpoints.
