# Mappo 0.2G desktop workspace rebuild

[Detailed G1–G4 implementation plan](G1_G4_IMPLEMENTATION_PLAN.md) ·
[Desktop mockups and rationale](assets/Mappo_0.2G_UI_Mockups.pdf)

## Direction

0.2G rebuilds how users interact with Mappo's existing city editor. The map,
selection, active tool, preview, and next available action should be easy to
follow during a real edit. A street move, a parcel split, and a courtyard edit
should feel like parts of the same application.

Desktop and laptop browsers are the support target for 0.2G and subsequent
Mappo development. Design with mouse, trackpad, and keyboard in mind. Phone
and tablet layouts, touch gestures, and mobile acceptance coverage are out
of scope. Civic places are deferred to a future milestone.

## Workspace design

- **Map.** Keep selection and draft geometry visible during edits. Link
  affected items in the impact list to highlights on the map. Center or
  highlight an item on demand while retaining the current draft.
- **Toolbar and Inspector.** Give project actions a stable location. Use the
  selection to expose relevant operations, including the existing route from
  a parcel to its buildings. Keep model facts and available actions visible
  together.
- **Active edit panel.** Standardize where users find the current tool,
  numeric controls, impacts, blockers, and Apply, Reset, and Cancel. Display
  the applicable Undo or Redo action and explain when history is unavailable.
  Retain each editor's existing history scope and transaction rules.
- **Desktop layout.** Prototype with a compact 1366×768 laptop viewport,
  1440×900 desktop, and 5120×1440 ultrawide. Use panel sizing and layout to
  preserve map space on laptops and make the extra width useful on large
  monitors. Evaluate docking and resizing in G1. Provide keyboard access,
  predictable focus, and usable controls at browser zoom.

### The three mockups

| PDF page | Layout and purpose |
| --- | --- |
| **1 · A · Map + edit panel** | Default desktop workspace. One large map with a right-side Inspector or active edit panel for the road offset, impacts, placement decisions, and Apply. |
| **2 · B · Map + impact dock** | One full-width map above a collapsible bottom dock. The impact list is on the left inside the dock, and the selected item's decision and Apply controls are on the right inside the dock. |
| **3 · C · Before + proposed** | Two maps side by side at the same position and zoom. A right-side review panel shows the proposed relocation and lets you choose it or return to the impact list. |

The dock and comparison are views of the same edit. Returning to the
default workspace keeps the current road draft, selected impact, and
placement decision.

## Module boundaries

The workspace owns layout, selection presentation, focus, shortcuts, shared
panel controls, and the display of active edit state. Domain UI modules own
their tool-specific controls, interaction bindings, and explanatory copy.
Each module declares the selections and actions it supports and supplies the
workspace with its draft state, impacts and blockers, commands, and history
availability. Settle the smallest interface that serves the pilot workflows.

Keep the existing engine and domain sessions as the source of truth for
geometry, validation, Apply, history, and persistence. UI layout preferences
belong to workspace state. Preserve portable format 1, project schema 9, old
saves, and the offline single-file HTML build. Any needed project migration
requires a separate decision.

A future civic-place tool should be able to add its own Inspector actions,
controls, and validation messages through the shared interface. It should use
the same workspace panels and shortcut handling as the existing tools.

## Development passes

| Pass | Deliverable | Acceptance gate |
| --- | --- | --- |
| **G1 — Prototype** | Build a clickable page 1 prototype. Use the Market Hall road conflict to demonstrate opening the page 2 impact dock and page 3 comparison. Sketch parcel split and courtyard editing in the page 1 layout. | Resolve the placement conflict and return to the default layout with the same draft, selected impact, and decision. Production engine integration starts in G2. Verify controls, focus, and map space at compact and ultrawide sizes. Review the prototype before wiring every editor. |
| **G2 — Workspace foundation** | Implement the map, toolbar, Inspector, active edit panel, and small interface for domain tools. Wire representative workflows through the existing sessions. | Selection, draft entry and exit, shortcut scope, Apply, blocked states, and scoped history use the same workspace conventions. |
| **G3 — Tool migration** | Add the road impact dock and comparison, then migrate parcel, plot, building, district, landscape, fortification, layer, and project file workflows in separate reviewable passes. | Use a feature-parity checklist that includes safe previews, impact decisions, keyboard and numeric editing, recovery, and file operations. Retire superseded UI paths after their replacement passes parity. |
| **G4 — Acceptance and switch** | Make the new workspace the default after parity. Update the user and developer guides and prepare the versioned standalone build. | Run desktop Chromium and Firefox coverage at laptop, desktop, and ultrawide sizes. Exercise mouse, trackpad-style pan and zoom, keyboard, old saves, offline operation, and representative Small and Large cities. Compare responsiveness using repeatable fixtures and keep issue #44 tracked separately. |

Use a fresh branch and review PR for each implementation pass. GitHub Actions
runs the full applicable validation at the review gate. Implementation and
feature merges follow the existing separate approval process. 0.2H remains
the release-hardening milestone.
