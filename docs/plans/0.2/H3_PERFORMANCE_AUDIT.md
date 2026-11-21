# Mappo 0.2H H3 — Performance audit and issue disposition

**State:** Measuring merged H1/H2 `main` baseline (`0.2-dev.g3g`, schema 9). No product-runtime changes or old-save changes. H3 PR is review-only and must not merge/release/publish without explicit owner approval.

## Goals and frozen workload

Use the original `scripts/c7-browser-performance.mjs` fixture and instrumentation unchanged for a comparable rerun:

- Small Organic `c2-organic`, junction `N-0139`, Y +15.
- Large Organic `c2-organic`, junctions `N-0145`, `N-0239`, `N-0332`, X +8.
- Chromium and Firefox, **desktop 1440×900 only** (0.2G deliberately no longer targets phones), cold/warm run per junction.
- Six Large preview samples per browser, with median and small-sample p95, max frame/timer gaps and trusted input while checking; warm independent Apply elapsed/click/frame gaps; stale invalid edit, rapid updates, accepted project fingerprint, Undo/Redo and recovery revision invariant.
- Require the embedded offline worker, not an external CDN or a mock response. Report browser version, hardware, runner variability and comparison to the historical C7 P7 numbers.

## Previous results — historical, not current measurements

P7 [performance report](C7_P7_INPUT_RESPONSIVENESS.md) documented Large Organic median preview **1.02–1.10 seconds**, worst frame gaps **150–167 ms**, median Apply finish **0.85–0.95 seconds** and an Apply click path around **22 ms**, on a different hosted runner. The original C7 Firefox reported >1-second blocked frames before the off-main-thread architecture. See [#44](https://github.com/xbwtyz/Mappo/issues/44) and [#46](https://github.com/xbwtyz/Mappo/issues/46).

## H3 execution and acceptance

- [ ] Run the existing benchmark on current merged H1/H2 code and retain per-trial JSON in the browser integration artifact.
- [ ] Compare preview and independent Apply timing with historic data; don't assume less total elapsed means less input blocking.
- [ ] Verify test-observed worker operation and journal/fingerprint invariants.
- [ ] Investigate slow or regressed gaps and identify their source before making any performance source edit; never weaken fresh Apply validation, atomic project replacement, worker cancel behavior or offline support.
- [ ] Record unresolved limits, issue #44 and issue #46 disposition recommendations; keep both open unless comparable measurements justify closure.
- [ ] Issue #79 remains separate dead-end engine work and is excluded.
- [ ] After measurement, remove the temporary benchmark-on-PR step, so routine six-runner CI remains as fast as before. Keep the benchmark opt-in through the existing `run_c7_benchmark` manual CI input.
- [ ] Full final PR CI green, owner review/merge approval separate, no tag, no release and no Pages deployment.

## User/developer experience

H3 primarily measures app responsiveness and clarifies known limits. Any source changes require a measured bottleneck and new regressions. No new UI or forced interaction is planned. Developers keep an optional reproducible audit script without adding an expensive check to every pull request.

## Measurements and findings

Pending benchmark run. This section will be updated with actual observed data, browser and runner hardware, and recommendation for issues #44 and #46.
