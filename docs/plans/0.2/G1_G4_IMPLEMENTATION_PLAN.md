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
shows the proposed placement for Market Hall, its placement choices,
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
| **G3E — Three-tab desktop navigation** | Bring over the approved Generation, Add, and Roads mockup. Mount live city, district, defense, and landscape controls in the resizable panel. Route parcel and building placement to their existing map editors. | Verify previews render a detached candidate, changing inputs invalidates it, and Apply uses the existing transaction. Verify all three tabs, map interaction, history, and compact fallback. |
| **G2F — Contextual editing and panel cleanup** | Normalize the remaining form layouts inside the new workspaces. Prioritize selected-record actions, and reconcile map status, Review impacts, and scoped Undo across Generation and Add. | Walk every create/edit path with the new tabs and identify any remaining actions that still require an old panel. |
| **G3G — Desktop parity and legacy retirement** | Migrate the remaining desktop checks and remove superseded desktop launchers and redundant controls after parity. | Exercise project files, recovery and export, current and old saves, road review and comparison, and tool handoffs entirely through the three-tab workspace. |
| **G4 — Desktop acceptance and switch** | Make the new workspace the default after parity. Retire superseded UI entry points and document the new workflows. Produce byte-identical root and versioned standalone HTML. | Pass GitHub CI on the review commit. Exercise the end-to-end desktop matrix, old saves, offline use, and representative Small and Large cities. Record remaining limitations, the user-experience changes, and the evidence for the switch. |

The workspace migration uses separate review passes. G2F follows G3E and precedes G3G. Each implementation
pass starts from updated `main` on a fresh branch and opens a review PR.
GitHub Actions runs the full applicable suite at review. Use targeted local
tests for failure diagnosis. Implementation and merge approvals follow the
existing project workflow.

## G2 road workspace preview

In the development build, choose **Road workspace preview** above the map in
City. The map and resizable right-side edit panel sit alongside each other.
Select a road or junction, inspect a real preview, resolve a building
placement, and apply through the existing road transaction. Escape or
Cancel restores the previous workspace. The **Undo road** map action
replays the accepted road history after Apply.

The shared layout positions a tool's panel and keeps map coordinates aligned
when panels resize. The road editor supplies its existing controls and owns
validation, impact decisions, and history. The current workspace remains the
default. The impact dock and split comparison arrive in later passes.
Property and building UI design has a separate draft and review before G3C.

## G3A road impact dock

In **Road workspace preview**, choose **Review impacts** to open the
bottom dock. Its table lists affected records and their status. Select a
record to center and highlight it on the map and see its details. A
building needing a choice uses the same placement controls and Apply
gate as the side panel.

Drag the separator or use its Up and Down arrows to adjust the dock.
**Collapse impact dock** returns to the side panel with the active
draft, selected record, and placement choices. A short or narrow
window returns to the side panel. The accepted and proposed comparison
is a separate G3B pass.

## G3B road comparison

Choose **Compare** from the road side panel or impact dock once the draft
has a verified proposal. The accepted city is on the left and the exact
candidate is on the right. Pan or zoom in either map to move both together.
The right panel uses the active placement choices and the existing Apply
action. Revising a choice refreshes the proposal. During revalidation, the
proposed map shows a status message until the next verified candidate is
available.

Comparison needs at least 1500 × 650 CSS pixels. **Back to impact list** or
**Back to road edit** and Escape restore the originating view. Shrinking the
window restores that view if it still fits, or the side panel if necessary.
The draft and its decisions travel with the edit.

## G3B2 road menu cleanup

**Edit** keeps the selected road or junction, Locate on map, and movement
controls in view. Select a record on the map or open **Road and junction
details** to select by ID. **Preview deletion** opens the existing removal
preview directly. Bends, connections, and precision controls expand within
Edit.

**Review impacts** shows the affected records and the selected item's
placement choices or details. Open the wide review or comparison from here.
Validation details retain technical reports and overlay controls. The footer
shows the current blocker and the existing Reset, Cancel, and Apply actions
in either view. Switching views preserves the draft and decisions. This
pass uses the existing road removal rules, including the limitation tracked
in [issue #79](https://github.com/xbwtyz/Mappo/issues/79).

## G3C property and building layout review

Open the standalone G3C HTML on desktop. Select an existing property in the
map, then choose **Split property** in its Inspector. Move the divider with
the map handle or numeric field. **Review impacts** shows parcel and plot
outcomes and any required building ownership transfers. The current
validation state and transaction controls are always in the footer.

Select a building from its property or click its footprint while that
property is selected. **Edit courtyard** opens the existing building
footprint editor with Courtyard selected. Preview an opening, review the
measured occupied area and any blockers, then Apply or Cancel. The parent
property remains available through the building Inspector.

The desktop Inspector puts common actions first. For properties, the building
list sits directly below them. For buildings, the parent-property link and
Locate action sit in the header. **Name & use** opens the existing identity
form. **More actions** holds deletion and replacement actions. Record facts
are collapsed by default.

The same desktop panel hosts property creation, merge, property and plot
geometry, and building placement or replacement. Existing domain tools
own the edit, validation, and history. The review branch holds layout
iterations and the offline HTML. Open a PR for CI once the layout review
is complete.

## G3D remaining workflows and parity

Use the existing domain controls and histories. The desktop Inspector puts
district and landscape controls before record details. **Project** and
**Layers** keep their existing entry points. Verify the workflows below in
the standalone build before final desktop acceptance in G4.

Remove superseded controls as part of this migration. District facts have
one Inspector presentation. The landscape list provides a single home for
water and terrain draft history and revert, even when the last feature was
removed. The obsolete Inspector command for opening inline controls is
retired. G3E connects the Roads tab to the desktop road workspace. G3G
retires the fallback desktop entry after parity.

| Workflow | Entry and next action | Commit, history, and persistence to verify |
| --- | --- | --- |
| City generation | **City** groups the outline, square, street pattern, density, and seed. The Tools footer has **Rebuild city**, the pending summary, and rebuild effects. | Confirm a rebuild still checks outstanding identities. Reverting outline and street settings restores only that draft. Download and reopen a project with unfinished generation settings. |
| Districts | Select a neighborhood from **Districts** or an open block on the map. Name, color, and block move controls appear before **District details**. Rebuild and Undo stay together on the Districts tab. | Apply identity changes or move a block through the existing connectivity checks. Rebuild districts independently of city generation and verify Undo. Reopen a saved selection and district draft. |
| Water and terrain | Select or add a feature from **Landscape**. Shape and crossing actions appear before generation settings. **Review city rebuild** reveals the existing rebuild controls and effects. | Test the river, coast, lake, and mountains. Keep water and terrain draft histories and revert actions scoped. Switching sections preserves completed drafts. Confirm Review alone leaves the accepted city intact and that a valid **Rebuild city** applies the draft. |
| Fortifications | **Defenses** shows enabled state, gates and towers, pending effects, **Update defenses**, and **Undo defense edit**. | Test validation, a defense-only update, and Undo. Turning off saved walls keeps their geometry. The Layers checkbox affects visibility. |
| Layers | Open **Layers** from the map header. Active road review uses its own overlay controls. | Apply a preset and an individual visibility change during a landscape draft. Verify draft geometry and history are unaffected, view state round-trips, and Escape returns focus to the menu button. |
| Files, recovery, and exports | Open **Project** from the header. Download/open a portable project, restore recovery, or download the visible map. | Check JSON with unfinished landscape work, exact accepted city on reopen, current and previous recovery, and PNG export. Verify menu focus and Escape, and that typing in forms leaves map shortcuts inactive. |

## G3E three-tab layout

**Generation** groups City layout, Districts, and Defenses. Review impacts
shows Before and Proposed on the same map. A change to generation settings
or the accepted city invalidates the preview. Apply uses the existing
city rebuild or domain transaction, including identity confirmation.

**Add** opens existing property creation, building placement, and landscape
editors. A new building needs a property selected on the map. Water and
terrain have their own draft histories and apply through Generation. The
Inspector remains the contextual editor for existing places. **Roads**
opens the existing road workspace and its impact review.

The standalone G3E review build opens the new workspace at 1000 CSS pixels
and above. The compact workspace remains available below that threshold.
Use `?workspace=legacy` for desktop parity comparisons until G3G removes
the separate desktop fallback. Project and Layers keep their entry points.

## G2F contextual editing and panel cleanup

Add keeps river, coastline, lake, and mountain editing in its resizable dock.
**Review impacts** shows the selected feature and whether its geometry has
changed. **Review city rebuild** opens Generation for the city-wide preview.
Create, regenerate, and scoped draft history controls stay in the footer.

District selection opens the selected neighborhood inside Generation, with
district Undo available while editing names, colors, and block assignments.
Defense Undo stays in the Generation footer. Property and building structure
history follows the Inspector. Road history feedback stays with its controls,
and City report and shortcuts sit under City layout. Project and Layers
retain their header entry points and share the dock styling.

## G3G — Desktop parity and legacy retirement

Use one feature branch/PR and four gates: audit, redundant desktop retirement, regression coverage, full standalone/CI validation. At >=1000 CSS pixels Generation/Add/Roads is canonical; remove the production `?workspace=legacy` override. Retain compact controls and existing domain DOM roots that the desktop dock still reuses. Re-selecting an active tab must not reset its draft. Tests cover the real desktop and keep specialized historical compact regression coverage without a public legacy route. Preserve schema 9, portable format 1, existing histories and independent Apply. G4 still owns release acceptance.

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
