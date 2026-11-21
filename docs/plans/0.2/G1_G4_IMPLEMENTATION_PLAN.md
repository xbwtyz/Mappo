# Mappo 0.2G workspace implementation plan

[Milestone scope](MILESTONE_0_2G_DESKTOP_UI.md) ·
[Desktop mockups and rationale](assets/Mappo_0.2G_UI_Mockups.pdf)

## The workspace we are building

### A · Map + edit panel · mockup page 1

This is the default desktop layout. A single large map sits to the left of a
resizable **right-side Inspector and edit panel**. The Inspector shows facts
and actions for the selected item while idle. During the Market Hall road
edit, the right panel shows the road offset, affected property count, Market
Hall's placement decision, and Reset, Cancel, and Apply. The map keeps the
road preview and affected building visible while you decide.

### B · Map + impact dock · mockup page 2

Open a collapsible **bottom dock** below a single full-width map. The dock
contains the impact table on the **left** and the selected item's details,
placement decisions, and Reset, Cancel, and Apply on the **right**. Both
columns sit inside the dock. Opening it moves the active edit controls from
the right sidebar into the dock. Selecting a row highlights the item on the
map. Collapsing the dock returns the controls to the right-side panel with
the draft and selected impact intact. Start with road impacts. Reuse the
dock for property workflows with a comparable review list.

### C · Before + proposed · mockup page 3

Open an optional wide-screen comparison from a road draft with a usable
preview. Place **two maps side by side**, with the accepted city on the
left and the proposed option on the right. Both maps use the same world
position and zoom, with linked pan and zoom. A **right-side review panel**
shows the proposed placement for Market Hall, **Use this placement**,
and the route back to the impact list. Decision and Apply controls live
in that panel. Closing comparison returns to the previous view with
the same draft and decisions. Explain when the current window or draft
cannot show a comparison.

A, B, and C share the same draft, current tool, edit history, and camera
state. A road remains the primary edit target while a building is inspected
as an affected item. An Apply or Undo command goes to the active domain
session, whichever view is open. Project commands have a stable location.

## Passes and review gates

| Pass | What to implement | What must be demonstrated before acceptance |
| --- | --- | --- |
| **G1 — Workflow prototype** | Build a clickable desktop prototype based on page 1. Use the Market Hall road conflict to open the page 2 bottom dock, where the decision controls move into the dock, and the page 3 comparison, where decisions live in its right-side review panel. Sketch parcel split and courtyard editing in the page 1 layout. Production engine integration starts in G2. | Walk through select → preview → blocker → decision → Apply or Cancel. Open the dock and comparison on the same road draft. Return to the default layout with the draft, selected impact, and placement decision intact. Check layout at 1366×768, 1440×900, and 5120×1440. Review the prototype and record the agreed panel behavior before building the production shell. |
| **G2 — Workspace foundation** | Build the page 1 single-map layout and right-side edit panel in the app. Wire a single end-to-end road workflow to the existing map, road session, and project commands. Add panel sizing, focus, and shortcut scopes. Define the small interface used by domain tools. Keep the current default while the new workspace is available for development and review. | Move a road, select its affected building, resolve or cancel the decision, apply once, and undo through road history. Verify stale validation cannot enable Apply, Escape restores useful focus, and switching between inspection and editing preserves the intended context. |
| **G3A — Road impact dock** | Move the remaining road controls into the new shell. Implement the page 2 bottom dock using the existing road impact results and decisions. Put the impact table and selected item’s decision controls side by side inside the dock. Keep the map highlight in sync with the selected row. | Review several affected records, act on a blocker, collapse the dock, and return to the map with the same draft. Confirm the dock respects available map height and keyboard focus. |
| **G3B — Before/proposed comparison** | Implement the page 3 comparison using the accepted city on the left, the active road preview on the right, and the right-side review panel. Link the cameras and reuse the active edit actions. Render the second map only while comparison is open. | Compare the road move and Market Hall placement on an ultrawide viewport. Change the decision, see it reflected in the proposal, and close the comparison without resetting the draft. Verify stale or missing proposals have a clear state and resizing to a compact layout returns the user to a usable single map. |
| **G3C — Property, plot, and building tools** | Move E1–E4 and F1–F4 workflows into the default single-map workspace. Bring over property-first building selection, identity, numeric geometry controls, replacement confirmation, and scoped history. | Complete a parcel split and a courtyard edit from the same workspace. Check applied edits and blockers, Cancel and Reset, metadata preservation, and geometry Undo/Redo. Use the shared edit panel and keep domain-specific controls in their tool modules. |
| **G3D — Remaining tools and project workflows** | Migrate generation settings, districts, water and terrain, fortifications, layers, and project files. Build a parity checklist from the current UI and track each workflow as it moves. | Verify generation, visibility controls, save/open, recovery, exports, and shortcuts. Close any parity gaps while the old workspace is still available for review. |
| **G4 — Desktop acceptance and switch** | Make the new workspace the default after parity. Retire superseded UI entry points and document the new workflows. Produce byte-identical root and versioned standalone HTML. | Pass GitHub CI on the review commit. Exercise the end-to-end desktop matrix, old saves, offline use, and representative Small and Large cities. Record remaining limitations, the user-experience changes, and the evidence for the switch. |

G3A through G3D are separate reviewable passes within G3. Each implementation
pass starts from updated `main` on a fresh branch and opens a review PR.
GitHub Actions runs the full applicable suite at review. Use targeted local
tests for failure diagnosis. Implementation and merge approvals follow the
existing project workflow.

## G1 review prototype

Download [the standalone prototype](../../../prototypes/0.2g/index.html) and
open it directly in a desktop browser. Choose **Move road**, then open
**Impact dock** to select affected records. **Before + proposed** is available
at widths of at least 1600 CSS pixels when the offset is +18. On narrower
windows the same relocation can be previewed and selected in the active map.
Use the **Properties** and **Buildings** tabs for the parcel and courtyard
sketches.

The prototype uses geometry from Mappo's planned-city Market Hall fixture
and scripted preview, validation, and history. Property and courtyard
sketches use independent scripted states. It exercises the interaction
model without writing a project file. The production app and build use
their existing entry points. G2 will wire the production road session.

GitHub CI exercises the prototype offline in Chromium and Firefox at all
three planned viewports and includes screenshots in its browser artifacts.

## Integration rules

- **Workspace responsibilities.** Own panel layout, focus, selection
  presentation, shared commands, and view state. Persist workspace
  preferences through the existing workspace mechanism where appropriate.
- **Tool responsibilities.** Each tool declares supported selections and
  actions and supplies its controls, preview status, impact items, blockers,
  and scoped history availability. The production interface starts with the
  road pilot and expands only when another migrated workflow needs it.
- **Authoritative state.** The existing engine and edit sessions own geometry,
  validation, accepted edits, and history. Views consume the active preview
  and its revision. They share selection and camera state, and do not create a
  second edit session when another view opens.
- **Transactions.** Review and view changes preserve the draft. Existing
  decisions about discarding a draft, revalidating on Apply, or blocking
  incompatible history remain with their domain tools. Browser file actions
  and keyboard shortcuts retain their existing scope and editable-field
  behavior.
- **Compatibility.** Keep schema 9, portable format 1, and the single-file
  offline distribution. Treat the old workspace as a temporary migration
  path through G3. Any project-format migration needs separate approval.

## Desktop acceptance

| Area | Coverage |
| --- | --- |
| **Browser and input** | Chromium and Firefox at 1366×768, 1440×900, and 5120×1440. Exercise mouse, keyboard, trackpad-style pan and zoom, resizing, and browser zoom. Confirm visible focus, reachable actions, and no shortcut conflicts in input fields. |
| **Editing and persistence** | Road conflict with A → B → C → A, parcel split and merge, courtyard editing, identity changes, scoped Undo/Redo, save/reopen, recovery, and offline standalone use. Confirm draft and accepted city stay distinct through every view transition. |
| **Responsiveness** | Use repeatable Small and Large fixtures. Measure gesture and redraw behavior in A and the incremental cost of opening B or C. Record browser, viewport, fixture size, and comparable results. Keep issue #44 tracked separately. |

Desktop and laptop browsers are the support target. Phone and tablet
layouts, touch acceptance, and civic-place tools remain deferred.
