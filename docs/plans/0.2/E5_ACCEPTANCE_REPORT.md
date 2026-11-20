# Mappo 0.2E — E5 integrated acceptance report

> **Status (2026-11-20):** E5 implementation under review on `feature/mappo-0.2e-e5-integration`. The E5 plan is merged in [PR #65](https://github.com/xbwtyz/Mappo/pull/65). **E5 is not merged, tagged, published, or a 0.2 release.** Latest-head full Node/browser CI must be green and a separate merge approval is required.

## Scope verified by the implementation

E5 adds **integration and acceptance testing**, not a new editor or a new persistence schema.

- New `tests/property-integration-e5.test.js`: accepted E2 frontage split → E3 whole-parcel reunion → E4 divider creation → schema-9 portable save/reopen → single structural Undo/Redo; verifies E2/E3/E4 lineage, unchanged roads/blocks/nodes/districts/openSpaces, and no mutation of draft sources.
- Same integration test verifies explicit authorization for retiring unknown authored plot metadata, full retired-record audit and zero acceptance when consent is missing.
- All four morphologies (planned, radial, organic, linear), Small and Large deterministic fixture coverage for legal E4 operations and independent validation.
- Road-first continuation: established accepted road drag fixture → edited streets remain authoritative → legal later plot-count edit → independent whole-city validation and portable save/reopen.
- New `scripts/property-integration-e5-browser-qa.mjs`: continuous **real UI** E3 merge → E4 split → Undo/Redo → reopen, Chromium and Firefox at 1440×900 and 390×844 touch. This extends, rather than replaces, the existing E1–E4 browser suites. No forced clicks.
- Verified one obsolete, unused E4 helper (`e4Issue`) removed from the existing shared validator. No new global history mechanism, duplicate editor, or broad refactor.

## Initial evidence and uncompleted gates

| Acceptance gate | Evidence | Status |
| --- | --- | --- |
| Focused E2/E3/E4 integration, metadata, morphology/size | `tests/property-integration-e5.test.js` | Passed focused CI before road test; final extended test pending |
| Accepted road adaptation → property editing | E5 road-first integration assertion | Final focused CI pending |
| Chromium/Firefox desktop/phone continuous E3→E4 UI | `scripts/property-integration-e5-browser-qa.mjs` | Pending permanent full CI |
| Preexisting road and E1–E4 regression | Full `npm test`, `npm run test:browser` | Pending permanent full CI |
| E5 standalone build | `npm run build` | Passed temporary controlled compiler |
| E5 root ↔ versioned offline HTML | `index.html` ↔ `dist/mappo-0.2-dev.e5.html` | Confirmed byte-identical Git blob SHA `d83f801a5f946c1dfa14f582fb743c1e084ec10b` |
| Temporary workflow cleanup | Git branch | Temporary E5 compiler and initial focused workflows removed; final focused workflow to remove after last verification |
| Schema | Existing schema-9 format-1 document APIs | Remains schema 9; no migration |

## Performance: controlled measurement, not an optimization claim

Source: temporary [focused CI run #44829103921](https://github.com/xbwtyz/Mappo/actions/runs/44829103921) (passed), `node scripts/e5-property-performance.mjs`.

- Runner: **Intel Xeon 6975P-C**, 4 reported CPUs, Linux x64, Node **v22.23.5**.
- Project: deterministic planned morphology; **Small: 193 properties / 265 plots**; **Large: 1,019 properties / 1,355 plots**.
- Each category: six warmed samples after a warm-up; p50 and p95 in milliseconds.

| City | Preview p50 | Preview p95 | Full-project Apply p50 | Full-project Apply p95 |
| --- | ---: | ---: | ---: | ---: |
| Small | 0.18 ms | 0.39 ms | 46.19 ms | 70.99 ms |
| Large | 0.30 ms | 0.85 ms | 188.91 ms | 216.36 ms |

These numbers are **Node model timings** for a legal E4 divider draft and full-project candidate validation, not browser input/frame gaps. They were not run sequentially against the historical C7/D4 road baseline on the same runner; **no speedup or numerical road-editor comparison is supported**. The runner, fixture and operation differ from the road-preview workload. Browser frame responsiveness and ongoing Large-city optimization remain independently tracked in [issue #44](https://github.com/xbwtyz/Mappo/issues/44). No latency regression threshold was silently inferred from unlike workloads.

## Deliberate limits and known non-goals

- E2 supports its documented four-corner straight splits; E3 requires one full shared frontage-to-rear edge and compatible block/road; E4 changes one divider per Apply and may refuse obstructed properties. No automatic repair of generated gaps or arbitrary polygon unions.
- Undo/Redo applies to the current operation's compatible history. **There is no claimed universal interleaved history stack across road and property editors**; unrelated accepted changes invalidate earlier incompatible histories by design.
- E5 tests an accepted road→property sequence in Node and a continuous E3→E4 browser sequence. It does not assert every permutation of E1–E4 actions on the same property is geometrically admissible.
- Full device hardware touch testing, broad performance optimization, 0.2F building tools, optional 0.2G civic sites, 0.2H release hardening and 3D are out of scope.
- Stable public release remains **0.1.0**. E5 may complete *milestone 0.2E* after separate acceptance, **not** the entire 0.2 roadmap.

## Final merge gates

1. The final E5 branch head passes full permanent Node regression, compiled standalone parity, and Chromium/Firefox desktop+phone acceptance, including the continuous E5 test.
2. No temporary workflows or build-time test artifacts remain in the PR; documentation matches actual results.
3. Review unresolved failures, regressions, performance and legacy schema-9 coverage; list limitations instead of claiming unmeasured success.
4. Owner explicitly authorizes merging the separate E5 implementation PR. No tag, publication or schema migration follows automatically.
