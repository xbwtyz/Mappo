# Dev 4f — Layer presets, visible-map PNG and export filenames

**Branch:** `feature/dev4f-layer-export-filenames` · **Candidate:** `0.1-dev.4f`
**Status:** Implemented for QA; owner merge approval pending.

## Scope and acceptance
- [x] Four visibility-only presets: Presentation, Planning, Minimal, All layers.
- [x] Existing seven layer flags remain canonical and saved in workspace schema 1. Manual checkbox editing produces Custom; restoration infers matched preset without storing any new field.
- [x] PNG download captures the currently visible, already-rendered canvas in the browser, with visible layers, selection and any preview. No network/API dependency or city geometry changes.
- [x] Optional file-name input affects both project JSON (.mappo.json) and map PNG (.png); safe filename slugging, path stripping, reserved device names and 64-character limit. Empty input keeps current city-name/date naming.
- [x] Offline single HTML, modular source, old distributions retained; project schema 9 unchanged.
- [x] Node unit and Chromium/Firefox browser QA covers preset selection, Custom, JSON filename, PNG filename, PNG signature/dimensions and schema-9 JSON load/save.
- [ ] Final CI green on precise PR head: Node, compiled HTML parity and browser matrices (four sizes × two engines).
- [ ] Owner approval required before merge.

The PNG is a raster of the *current viewport*, not an automatically tiled full-map export. Download filename preferences are UI-only and do not rename the city or modify saved project content.
