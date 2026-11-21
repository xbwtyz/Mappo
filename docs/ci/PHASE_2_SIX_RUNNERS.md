# Mappo CI Phase 2: six-runner validation

## Purpose

Shorten full PR feedback without removing any Node tests, browser QA coverage, C7 offline checks, or browser viewport checks. Make these changes on a separate PR, keeping the existing required aggregate status and all release protection.

## Before: verified G3G baseline

- [Last full PR run](https://github.com/xbwtyz/Mappo/actions/runs/44948982751): **3m 24s** elapsed, with 447 Node tests plus 16 browser scripts.
- [First main-branch run after Phase 1 merge](https://github.com/xbwtyz/Mappo/actions/runs/44949563818): **4m 11s** elapsed.
- In the G3G run, Node build/regression was ~3m 03s, while browser workspace checks were ~2m 33s plus setup, both on the critical path.
- Previous successful Phase 1 G2F runs took 3m 36s and 5m 13s. Variability in expensive seeded-city regressions is real.

## Changes

Use **six independent, parallel GitHub-hosted Linux runners**:

| Job | Work | Coverage policy |
| --- | --- | --- |
| Node shard 1/2 | Native Node `--test-shard=1/2`, compile and verify | Every selected test file in its own isolated Node worker |
| Node shard 2/2 | Native Node `--test-shard=2/2`, compile and verify | Remaining files, disjoint and exhaustive with shard 1 |
| Browser desktop | G3G desktop parity; three-tab desktop; G2 workspace | Existing Chromium and Firefox desktop/laptop/ultrawide cases |
| Browser roads | Full road QA, C7 P2 browser QA, C7 P3 offline QA | Existing Chromium/Firefox road and offline cases |
| Browser property | Seven existing building/property scripts | Exact existing scripts |
| Browser integration | Three existing broad UI/acceptance/performance scripts | Exact existing scripts |

The native test-runner sharding covers the **same 80 `tests/*.test.js` files** as `npm test`. Every Node shard builds its own standalone HTML before testing. The local `npm test`, `npm run check`, `npm run test:browser:workspace` and `npm run test:browser` commands remain available and retain their full effective test coverage.

GitHub's browser matrix is expanded from 3 to 4 entries; the Node job gains 2 matrix entries. Both matrices have `fail-fast: false` so failures are diagnosed independently. No packages, production app sources, test bodies, Playwright browser engines or tracked distribution artifacts are modified.

The final job name remains **Build, Node tests and browser QA**. It requires `needs.node.result` and `needs.browser.result` both to equal `success` before it passes; a failing shard must fail the aggregate. Standalone HTML is uploaded only by the first Node shard to avoid duplicate artifact names. Browser artifacts remain isolated per suite.

The slow C7 desktop browser performance benchmark remains opt-in and is only run in the integration suite when manually dispatched. The fast branch workflow, GitHub Pages, and release workflows are unchanged.

## Initial measured result

The first full [Phase 2 PR run #44950879528](https://github.com/xbwtyz/Mappo/actions/runs/44950879528) **passed** with all six independent test jobs and the unchanged required aggregate gate. Wall-clock elapsed time was **2m 36s**, versus **4m 11s** for the prior main-branch Phase 1 run (a **37.8%** improvement, **1m 35s** saved), and versus **3m 24s** for the earlier fast G3G PR run (**23.5%** improvement).

Native Node shard 1 executed **227/227** tests in **1m 36s**, and shard 2 executed **220/220** in **1m 19s**: exactly **447/447** tests combined, with no loss in test count. All 16 browser QA scripts remain assigned exactly once across the desktop, roads, property and integration suites. The standalone `mappo-0.2-dev.g3g` HTML artifact and four independent browser evidence artifacts were uploaded.

These timings are measured first-run observations, not guaranteed future durations. A separate confirmation run is required to check repeatability and runner variability.

## Validation gates

- [x] Node 22 native sharding parses and executes 2 distinct test partitions successfully.
- [x] Combined Node test count matches the unsharded baseline (447 in G3G).
- [x] All 16 original browser scripts execute exactly once across the four CI suites.
- [x] Combined required status is green after all six jobs passed (failure-gating behavior preserved by the aggregate result check).
- [x] Standalone HTML and four browser evidence artifacts are available.
- [ ] Record multiple Phase 2 wall-clock timings against G3G 3m 24s–4m 11s baseline.
- [ ] Owner explicitly approves merge. No tag, release, or publication.

## What changes for users?

There is **no Mappo editor/UI change**. Faster CI only shortens developer feedback time and separates desktop and road failure diagnostics.
