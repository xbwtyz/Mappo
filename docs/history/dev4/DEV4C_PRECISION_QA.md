# Mappo 0.1 Dev 4c — Precision Editing and Shortcuts

**Status:** Implemented for feature-branch QA; owner merge approval pending.
**Branch:** `feature/dev4-editing-precision` · **Version:** `0.1-dev.4c`.

## Scope and acceptance

- [x] Context-aware Delete requests existing confirmed property/building deletion, never from a field or during a preview.
- [x] Existing Escape/Undo/Redo shortcuts stay scoped through `isMapShortcutEvent`; active session cancellation retains its discard confirmation.
- [x] Canvas-focused arrows use the selected increment to nudge a building, selected property corner, or placement ghost.
- [x] Preview panels expose live width/depth/area/area-change and position/offset measurements where applicable.
- [x] Touch-friendly nudge buttons and increments (0.1, 0.5, 1, 5); same edit-session setters as existing numeric and drag controls.
- [x] Preview-only operations; Apply remains the sole path to accepted city geometry. Project schema 9, workspace schema 1.
- [x] Pure model tests and extra browser QA exercising property/building nudge and geometry immutability.
- [ ] Full green CI on final head, including Node, compiled HTML parity and Chromium/Firefox viewport matrices.
- [ ] Separate owner approval before merging.

## Limitations
Survey units are Mappo's internal map units, not physical meters. Property width/depth are the extents along its saved frontage frame. Building width/depth are its local pre-rotation dimensions, while area respects courtyard holes.

Keyboard shortcuts deliberately ignore input, select, button, menu and rich-text focus to avoid hijacking native browser behavior. Arrow nudging requires map-canvas focus. The Delete shortcut triggers the same confirmation-gated action as the Inspector; Backspace is reserved for existing point-editing tools.
