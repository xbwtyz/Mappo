# Mappo CI and Repository Hygiene

The required `Mappo CI` runs full validation on review-ready PRs, main pushes, merge groups and manual dispatch. Lightweight `Mappo Fast Checks` run on feature branch pushes. Superseded checks for the same PR/ref are canceled.

## Six concurrent full CI jobs

| Runner | Responsibilities |
| --- | --- |
| Node shard 1/2 | Compile offline standalone; run native Node file shard; verify `index.html` equals tracked versioned HTML |
| Node shard 2/2 | Compile; run complementary Node shard; verify standalone distribution parity |
| Browser desktop | 8 scripts: desktop workspace, save/recovery and building footprint/compound QA |
| Browser roads | 8 scripts: road editing, selection, input routing, snapping, ownership, reflow and offline QA |
| Browser property | 10 scripts: parcel/property editing, creation, split/merge, identity and property integration |
| Browser integration | 6 scripts: general browser QA, D4 acceptance, F4 performance, whole-city PNG, courtyard access and components |

All six jobs must pass for the unchanged required `Build, Node tests and browser QA` check to succeed. Browser runners use the official Playwright v1.56.1-noble container plus matching test-only package and retain Chromium and Firefox. The manifest `scripts/browser-suites.json` assigns all **32 A2 browser QA scripts** exactly once across the four suites. `scripts/run-browser-suite.mjs` records durations, exit status, per-suite timing artifacts and GitHub Actions summaries. The independent inventory test guards against omitted/duplicate scripts. See [CI optimization plan](ci-optimization-0.2.19.md). G4 retains its existing viewport and file:// coverage; no test scripts were rewritten.

H2 adds frozen 3A.2–3E.5 historical save migration and nonmutation tests to the Node matrix, plus real Chromium/Firefox Project-menu import, rejection and re-export for representative schemas in the desktop browser group. `npm run test:browser:h2` runs that focused browser suite.

H4 adds real IndexedDB-backed browser recovery acceptance in both desktop browsers: two distinct Project-menu imports, successive saved snapshots, actual reload, explicit latest/previous restoration, preserved authored geometry, and portable download/reopen. Run `npm run test:browser:h4` for this focused test. Existing G4 and H2 tests provide cross-editor and historical-save gates, rather than duplicating them.

Use GitHub Actions for routine automated runs and lengthy replays when a hosted job covers the check. Start with the run, logs and artifacts for the exact revision. See the [CI Test Policy](ci-policy.md) for when to run a check locally.

Node and build do not need npm installation. When a local check is needed, choose the command that covers the case:

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

CI's Node shard uploads the compiled `index.html` and matching `dist/mappo-<APP_VERSION>.html` (for H5, `dist/mappo-0.2.0.html`); each browser suite uploads independent screenshots and QA evidence, retained 14 days. G4 stores machine context and Small/Large draw and road preview results in `artifacts/g4/desktop-acceptance.json` / `.md`. Wall-clock results on shared CI hardware are comparative diagnostics, not physical-device measurements.

CI uses `contents: read`; it never commits, tags or publishes. The separate `release.yml` is manual-only on `main` and rejects development versions, missing release notes, absent green CI for the exact commit, and existing immutable tags. Passing CI never publishes a release. The separate `pages.yml` uses **manual dispatch on main only**; merging a PR doesn't publish Pages. The optional heavy C7 browser benchmark is only run by selecting `run_c7_benchmark` on a manual Mappo CI dispatch.

See [G4 acceptance](../history/0.2/workspace/g4-acceptance-report.md), [current roadmap](../plans/README.md) and [desktop implementation plan](../history/0.2/workspace/g1-g4-implementation-plan.md).
