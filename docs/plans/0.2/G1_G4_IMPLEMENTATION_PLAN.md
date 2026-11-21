# Mappo 0.2G workspace implementation plan

[Milestone scope](MILESTONE_0_2G_DESKTOP_UI.md) ·
[Desktop mockups and rationale](assets/Mappo_0.2G_UI_Mockups.pdf)

## The workspace we are building

**A, Map + edit panel**, is the default workspace. It keeps the selected
feature, active tool, validation, and Apply in one place. The right panel can
be resized within limits that preserve usable map space. The Inspector
presents selection facts and actions when idle and the active edit when a
tool owns a draft.

**B, Map + impact dock**, is an optional view for edits with a list of
affected records. Start with the road impact list. Open or collapse the dock
without leaving the edit. Selecting a row highlights the feature and brings
its decision into the edit panel. Reuse the dock for a property workflow
when it has a comparable review list.

**C, Before + proposed**, is an optional comparison view for wide screens.
Open it from a road draft with a usable proposed preview. Show the accepted
city and the current candidate at the same world position and zoom. Review
the two maps with linked pan and zoom, then return to the same draft. The
comparison is read-only. The edit panel owns decisions and Apply, and the
workspace explains when a proposed preview or sufficient room is unavailable.

A, B, and C share the same draft, current tool, edit history, and camera
state. A road remains the primary edit target while a building is inspected
as an affected item. An Apply or Undo command goes to the active domain
session, whichever view is open. Project commands have a stable location.

## Passes and review gates

| Pass | What to implement | What must be demonstrated before acceptance |
| --- | --- | --- |
| **G1 — Workflow prototype** | Build a lightweight desktop prototype of A. Prototype the dock and comparison as views opened from A. Use the Market Hall road conflict, a parcel split, and adding a courtyard to settle the interaction model. | Walk through select → preview → blocker → decision → Apply or Cancel. Open B and C on the road draft and return to A with the draft and affected item still selected. Check layout at 1366×768, 1440×900, and 5120×1440. Review the prototype and record the agreed panel behavior before building the production shell. |
| **G2 — Workspace foundation** | Build A in the app. Wire a single end-to-end road workflow to the existing map, road session, and project commands. Add panel sizing, focus, and shortcut scopes. Define the small interface used by domain tools. Keep the current default while the new workspace is available for development and review. | Move a road, select its affected building, resolve or cancel the decision, apply once, and undo through road history. Verify stale validation cannot enable Apply, Escape restores useful focus, and switching between inspection and editing preserves the intended context. |
| **G3A — Road impact dock** | Move the remaining road controls into the new shell. Add B using the existing road impact results and decisions. Keep the same impact selection in the map, dock, and edit panel. | Review several affected records, act on a blocker, collapse the dock, and return to the map with the same draft. Confirm the dock respects available map height and keyboard focus. |
| **G3B — Before/proposed comparison** | Add C using the accepted city and the active road preview. Link the cameras and keep the shared Inspector and actions. Render the second map only while comparison is open. | Compare the road move and Market Hall placement on an ultrawide viewport. Change the decision, see it reflected in the proposal, and close C without resetting the draft. Verify stale or missing proposals have a clear state and resizing to a compact layout returns the user to a usable single map. |
| **G3C — Property, plot, and building tools** | Move E1–E4 and F1–F4 workflows into A. Bring over property-first building selection, identity, numeric geometry controls, replacement confirmation, and scoped history. | Complete a parcel split and a courtyard edit from the same workspace. Check applied edits and blockers, Cancel and Reset, metadata preservation, and geometry Undo/Redo. Use the shared edit panel and keep domain-specific controls in their tool modules. |
| **G3D — Remaining tools and project workflows** | Migrate generation settings, districts, water and terrain, fortifications, layers, and project files. Build a parity checklist from the current UI and track each workflow as it moves. | Verify generation, visibility controls, save/open, recovery, exports, and shortcuts. Close any parity gaps while the old workspace is still available for review. |
| **G4 — Desktop acceptance and switch** | Make the new workspace the default after parity. Retire superseded UI entry points and document the new workflows. Produce byte-identical root and versioned standalone HTML. | Pass GitHub CI on the review commit. Exercise the end-to-end desktop matrix, old saves, offline use, and representative Small and Large cities. Record remaining limitations, the user-experience changes, and the evidence for the switch. |

G3A through G3D are separate reviewable passes within G3. Each implementation
pass starts from updated `main` on a fresh branch and opens a review PR.
GitHub Actions runs the full applicable suite at review. Use targeted local
tests for failure diagnosis. Implementation and merge approvals follow the
existing project workflow.

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
