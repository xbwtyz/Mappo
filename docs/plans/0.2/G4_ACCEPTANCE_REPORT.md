# Mappo 0.2G G4 — Desktop acceptance report

**Status:** Under review on the G4 feature branch. The canonical desktop switch and retirement of the legacy public desktop route were completed in G3G. G4 verifies the integrated workspace rather than creating a second UI.

**Candidate:** `0.2-dev.g3g` (same application source), project schema 9 and portable format 1. CI must rebuild and verify byte-identical `index.html` and `dist/mappo-0.2-dev.g3g.html`. A new version is unnecessary for acceptance-only tests and docs; 0.2.0 is not yet published.

## Acceptance coverage

| Gate | Evidence |
| --- | --- |
| Desktop shell | New `scripts/g4-desktop-acceptance-browser-qa.mjs` tests Chromium and Firefox at laptop 1366×768, desktop 1440×900 and ultrawide 5120×1440, without enabling a legacy test seam |
| Input and focus | Real wheel zoom, Space+drag map pan, focused-form keyboard isolation, browser zoom and page overflow tests |
| Road workflow A → B → C | Market Hall placement conflict, edit view, impact dock and wide comparison; Cancel and all view transitions must leave accepted city intact |
| Existing domain editors | Permanent E1–E5/F1–F4 Node and browser suites retain actual property split/merge/plot/courtyard/identity/history regression coverage; the three-tab UI tests cover their navigation |
| Historical save and offline | Load native format-1/schema-2 fixture via Project file chooser, verify migrated road geometry and re-export; run compiled `file://` HTML without a server |
| Responsiveness | Small Planned and Large Organic redraw samples, road preview wall time, runner context and JSON/Markdown records in `artifacts/g4/` |
| Full gate | Two Node shards, four independent browser QA suites, final required `Build, Node tests and browser QA` result and separate artifact uploads |

The browser measurements are diagnostic only; shared CI runner timing does not prove physical-device responsiveness. G4 does not weaken road validation, provenance protections, independent Apply, Undo/Redo or legacy schema compatibility.

## Acceptance checklist

- [ ] Current three-tab desktop QA green in Chromium/Firefox at all three viewports
- [ ] Road review and preview-to-accepted isolation verified
- [ ] Old native project migrated without regenerating road geometry; offline HTML opened
- [ ] Existing domain and preservation regressions all green
- [ ] Small/Large redraw evidence recorded and limitations disclosed
- [ ] Root and versioned HTML exactly reproducible
- [ ] Review-ready PR head passes all six CI jobs and required aggregate gate
- [ ] Separate owner approval before merge

## Deferrals

[#44](https://github.com/xbwtyz/Mappo/issues/44) and [#46](https://github.com/xbwtyz/Mappo/issues/46) remain open for separately approved large-city preview/Apply responsiveness work. [#79](https://github.com/xbwtyz/Mappo/issues/79) dead-end road deletion is not in G4 scope. No new civic tools, 3D, schema migration, forced walkthrough, phone/touch acceptance, 0.2H release tasks or publication are included.

## User experience since G3G

No application UI or editing semantics changed. G4 verifies the existing canonical desktop workflows, records their performance/compatibility evidence and updates the written guidance. Published 0.1.0 and development 0.2 remain distinct.
