# Mappo 0.2G G4 — Desktop acceptance report

**Status:** G4 implementation and complete automated acceptance passed on [PR #87](https://github.com/xbwtyz/Mappo/pull/87); waiting for separate owner merge approval. The canonical desktop switch and public legacy-route retirement happened in merged G3G. G4 verifies the resulting integrated workspace rather than introducing a second UI.

**Candidate:** `0.2-dev.g3g`, project schema **9**, portable project format **1**. The G4 change modifies only browser QA, npm test commands and documentation. Runtime module sources, the checked-in `index.html`, and versioned `dist/mappo-0.2-dev.g3g.html` are unchanged. CI rebuilds the standalone and checks the compiled root/distribution bytes match with no tracked build drift. This does not authorize a 0.2.0 release or GitHub Pages deployment.

## Tested scope

| Acceptance | Automated evidence |
| --- | --- |
| Canonical desktop UI | `scripts/g4-desktop-acceptance-browser-qa.mjs` in Chromium and Firefox at **1366×768**, **1440×900**, **5120×1440**; default Generation/Add/Roads route and no public desktop legacy switch |
| Keyboard, mouse and viewport | Focused-form keyboard isolation; real wheel zoom, Space+drag pan, browser zoom and no horizontal overflow |
| Road A → B → C → A | Market Hall road draft, unresolved placement blocker, impact dock, proposed/accepted comparison on ultrawide, and Cancel without mutating accepted geometry |
| Cross-editor desktop acceptance | `scripts/g4-cross-editor-browser-qa.mjs` on real 1440×900 desktop: property split → adjacent merge → building wing → courtyard → scoped Undo/Redo → portable capture/reopen, in both browsers |
| Broader domain regression | Existing E1–E5/F1–F4 Node and browser suites remain, covering plot counts, building transforms, names/uses, history, validation, and failed Apply isolation |
| Old project files | Project menu opens the frozen **format-1/schema-2** native file, migrates to schema 9 without regenerating its road nodes or IDs, then downloads a schema-9 portable file |
| Offline | Actual compiled `file://` HTML starts in Chromium and Firefox without an injected test observer, server, or outbound HTTP requests |
| Artifacts | G4 JSON/Markdown measurements and diagnostic screenshots in the separately uploaded desktop browser artifact; compiled standalone and other three browser evidence artifacts retained |

## Completed CI and reproducible results

- [Full G4 six-runner CI #44954303371](https://github.com/xbwtyz/Mappo/actions/runs/44954303371) passed in **3m 05s**, with both Node shards, desktop, roads, property, integration and the unchanged aggregate **Build, Node tests and browser QA** check green.
- [Desktop evidence artifact](https://github.com/xbwtyz/Mappo/actions/runs/44954303371/artifacts/14726887842) contains `g4/desktop-acceptance.json`, `g4/desktop-acceptance.md` and other browser evidence.
- Both G4 cross-editor Chromium and Firefox runs passed: split/merge, wing/courtyard, scoped Undo/Redo and a portable round-trip.
- Runner context: **Linux, 4 logical CPUs, Intel Xeon 6975P-C**. Small Planned `c2-planned` and Large Organic `c2-organic` fixtures were used for redraw sampling. Road preview timing used the Small Planned Market Hall placement case.

| Browser | Viewport | Small double-frame median (ms) | Large double-frame median (ms) | Road preview wall (ms) |
| --- | --- | ---: | ---: | ---: |
| Chromium | 1366×768 | 33.3 | Not sampled | 332 |
| Chromium | 1440×900 | 33.3 | 33.1 | 340 |
| Chromium | 5120×1440 | 35.5 | 35.8 | 326 |
| Firefox | 1366×768 | 34.0 | Not sampled | 348 |
| Firefox | 1440×900 | 33.0 | 33.0 | 355 |
| Firefox | 5120×1440 | 33.0 | 49.0 | 357 |

**Important measurement limits:** The double-frame samples each include two `requestAnimationFrame` callbacks, and therefore are **not** pure renderer execution time, frame pacing percentiles or physical-device input latency. Each row describes five measured redraw samples on a shared CI runner. The road preview wall times measure a single Small Planned road proposal from input until the current revision settles, not an extended Large Organic latency study. They do not prove that large-city Apply and preview stalls in [#44](https://github.com/xbwtyz/Mappo/issues/44) or [#46](https://github.com/xbwtyz/Mappo/issues/46) are fixed. No performance threshold was imposed or accepted without comparison.

## Acceptance checklist

- [x] Canonical desktop QA passed in Chromium/Firefox at all three viewports.
- [x] Road edit / impact dock / optional comparison and accepted/draft isolation verified.
- [x] Real cross-editor property split/merge → wing/courtyard → Undo/Redo → portable reopen verified in both browsers.
- [x] Historical native project migration and true offline startup verified.
- [x] Existing domain safety, Node and four browser suites passed.
- [x] Small/Large diagnostic evidence collected with test hardware and caveats.
- [x] Root/versioned standalone byte parity and no product-source drift checked in CI.
- [x] Full CI passed with the final required aggregate check on implementation revision.
- [ ] Owner explicitly approves merge. Revalidate final documentation-only commit's CI status before merging.

## Deferrals and release boundaries

- [#44](https://github.com/xbwtyz/Mappo/issues/44) and [#46](https://github.com/xbwtyz/Mappo/issues/46): large-city preview/Apply responsiveness, for a separately approved investigation in 0.2H (not closed by G4).
- [#79](https://github.com/xbwtyz/Mappo/issues/79): connected dead-end road deletion, a separate engine/feature choice.
- Civic sites, 3D, phone/touch-specific acceptance, any schema migration and 0.2H release hardening are outside this PR. A successful G4 review does not trigger a tag, a GitHub release or manual Pages publication.

## User experience since G3G

**No end-user UI controls or editing semantics changed.** G4 adds independent integrated browser acceptance of the already-shipped canonical desktop UI and clear, current documentation. Developers get repeatable evidence that the assembled workflows, historical files, offline build and accepted/draft separation work together. Stable published 0.1.0 remains distinct from development 0.2.
