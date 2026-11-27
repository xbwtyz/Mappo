# Mappo CI and Repository Hygiene

The required `Mappo CI` runs full validation on review-ready PRs, explicitly requested draft PRs, main pushes, merge groups and manual dispatch. Lightweight `Mappo Fast Checks` run on feature branch pushes without an exact-head PR full-CI owner. Superseded checks for the same PR/ref are canceled.

## Request full CI without making a PR review-ready

On an open draft PR, push a commit with `[full-ci]` in its message to run all twenty suite runners; use `[full-ci-benchmark]` to add heavy C7 performance and stale-draft checks. A normal commit returns a draft to Fast Checks. A marker on a branch without an open PR still gets Fast Checks until a PR is opened. Ready PRs always get full CI. The markers are case-insensitive and benchmark takes precedence. Manual dispatch remains available. The routing job and aggregate are lightweight support jobs, not extra regression suites. Draft status and the separate merge/release/Pages approvals are unchanged.

## Request a focused benchmark on a draft PR

Use `[benchmark-f4]` for the F4 building benchmark, `[benchmark-c7]` for the C7 road benchmark, or both tokens to run the two benchmark jobs in parallel. Normal Fast Checks still run. Each benchmark checks out the exact draft head, verifies standalone parity, uses the matching Playwright environment, and uploads its own diagnostic artifacts. No other regression suite runs for these markers alone. Full markers or a ready-for-review PR take precedence; ordinary full CI still runs F4 and the existing C7 correctness tests. These diagnostic results cannot replace the required full gate. A branch without an open PR gets normal Fast Checks until a PR opens.

## Twenty concurrent full CI test jobs

| Runner | Responsibilities |
| --- | --- |
| Node shards 1–16 | Compile the exact offline standalone; execute measured file assignments under the native Node runner, check byte parity and retain per-file timing reports |
| Browser desktop | 6 independent scripts |
| Browser roads | 10 independent scripts |
| Browser property | 11 independent scripts |
| Browser integration | 10 independent scripts |

All twenty regression jobs must pass. The unchanged required `Build, Node tests and browser QA` aggregate independently verifies all 16 same-run/attempt Node reports against the exact checkout and complete file inventory. Routing and aggregate are support jobs, not extra regression suites. Browser runners retain Playwright v1.56.1-noble, Chromium and Firefox, and all 37 scripts in the independently checked `scripts/browser-suites.json` manifest. Timings and actual executed file evidence are uploaded. The first Node shard produces the manual acceptance package and standalone artifacts. `npm test` remains the complete native local inventory; the two older npm shard commands below are historical/reference tools, not the hosted CI architecture. New files receive conservative estimated weights automatically; the live tracked inventory, not the historical timing snapshot, determines coverage. A pilot is not a mandatory full gate.


H2 adds frozen 3A.2–3E.5 historical save migration and nonmutation tests to the Node matrix, plus real Chromium/Firefox Project-menu import, rejection and re-export for representative schemas in the desktop browser group. `npm run test:browser:h2` runs that focused browser suite.

H4 adds real IndexedDB-backed browser recovery acceptance in both desktop browsers: two distinct Project-menu imports, successive saved snapshots, actual reload, explicit latest/previous restoration, preserved authored geometry, and portable download/reopen. Run `npm run test:browser:h4` for this focused test. Existing G4 and H2 tests provide cross-editor and historical-save gates, rather than duplicating them.

Node and build do not need npm installation. For local testing:

```bash
npm run build
npm test
npm run check
npm run test:node:shard:1
npm run test:node:shard:2
npm run test:browser                 # after Playwright browser setup
npm run test:browser:desktop
npm run test:browser:g4
npm run test:browser:h4                 # recovery across browser reloads
```

Browser setup: `npm install --no-save --no-package-lock playwright@1.56.1`; `npx playwright install chromium firefox` (with dependencies on Linux).

## Artifacts and deployment

CI's first Node shard uploads the compiled `index.html` and matching `dist/mappo-<APP_VERSION>.html` (for H5, `dist/mappo-0.2.0.html`); each browser suite uploads independent screenshots and QA evidence, retained 14 days. G4 stores machine context and Small/Large draw and road preview results in `artifacts/g4/desktop-acceptance.json` / `.md`. Wall-clock results on shared CI hardware are comparative diagnostics, not physical-device measurements.

CI uses `contents: read`; it never commits, tags or publishes. The separate `release.yml` is manual-only on `main` and rejects development versions, missing release notes, absent green CI for the exact commit, and existing immutable tags. Passing CI never publishes a release. The separate `pages.yml` uses **manual dispatch on main only**; merging a PR doesn't publish Pages. The optional heavy C7 browser benchmark is run only by selecting `run_c7_benchmark` on a manual Mappo CI dispatch using the `[full-ci-benchmark]` PR head commit marker, or using `[benchmark-c7]` on an ordinary draft PR.

See [G4 acceptance](../history/0.2/workspace/g4-acceptance-report.md), [current roadmap](../plans/README.md) and [desktop implementation plan](../history/0.2/workspace/g1-g4-implementation-plan.md).


Ordinary Fast Checks adapt from one to sixteen Node runners using the selected file weights. A parallel run is only green when every selected shard and the focused completeness check pass. Neither light nor parallel focused evidence substitutes for full CI.
