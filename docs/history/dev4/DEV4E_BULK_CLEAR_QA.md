# Dev 4e — Clear Property Buildings and Contextual Undo/Redo

**Branch:** `feature/dev4e-building-bulk-clear` · **Standalone:** `0.1-dev.4e`
**State:** Implementation complete; QA and owner merge approval required.

## Scope
- [x] Property Inspector **Clear all buildings…** action, disabled when no buildings are present, including when the Buildings layer is hidden.
- [x] Named-property confirmation shows exact building count. Cancel leaves city unchanged.
- [x] Atomic cloned candidate removes only buildings owned by the chosen property, clears parent `buildingIds`, keeps property/plots/roads/open-space accounting/neighboring buildings intact.
- [x] Ownership consistency, schema-9 validation and portable save/load round-trip gate acceptance.
- [x] A **single** `BuildingStructureHistory3H` entry for a bulk clear; session Undo restores every original building and ID in order, Redo clears again.
- [x] Context-specific Undo/Redo descriptions for add, replace, delete and bulk clear appear in buttons, tooltips, history status, global Undo and result messages.
- [x] Focused Node and real Chromium/Firefox browser tests for full clear, cancel, undo/redo and unchanged accepted geometry.
- [ ] CI green on exact head: Node tests, HTML distribution parity, Chromium/Firefox browser QA in four viewports.
- [ ] Explicit separate owner merge permission.

**Compatibility:** Project schema 9 and workspace schema 1 unchanged; no history data is written to saves. Keep previous standalone distributions.
