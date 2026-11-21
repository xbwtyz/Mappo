# Mappo CI and Repository Hygiene

The required `Mappo CI` runs full validation on review-ready PRs, main pushes, merge groups and manual dispatch. Lightweight `Mappo Fast Checks` run on feature branch pushes. Superseded checks for the same PR/ref are canceled.

## Six concurrent full CI jobs

| Runner | Responsibilities |
| --- | --- |
| Node shard 1/2 | Compile offline standalone; run native Node file shard; verify `index.html` equals tracked versioned HTML |
| Node shard 2/2 | Compile; run complementary Node shard; verify standalone distribution parity |
| Browser desktop | G3G canonical workspace, three-tab navigation, G4 desktop acceptance |
| Browser roads | Road editing, C7 cancellation and offline browser QA |
| Browser property | Building/plot/property transformation, creation, merge and split checks |
| Browser integration | General browser QA, D4 acceptance and F4 performance |

All six jobs must pass for the unchanged required `Build, Node tests and browser QA` check to succeed. Browser runners install test-only Playwright 1.56.1 with Chromium and Firefox. Existing 16 scripts remain; G4 adds a modern-desktop acceptance script, including 1366×768, 1440×900 and 5120×1440, old-save migration and actual `file://` startup.

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
```

Browser setup: `npm install --no-save --no-package-lock playwright@1.56.1`; `npx playwright install chromium firefox` (with dependencies on Linux).

## Artifacts and deployment

CI's Node shard uploads the compiled `index.html` and matching `dist/mappo-<APP_VERSION>.html`; each browser suite uploads independent screenshots and QA evidence, retained 14 days. G4 stores machine context and Small/Large draw and road preview results in `artifacts/g4/desktop-acceptance.json` / `.md`. Wall-clock results on shared CI hardware are comparative diagnostics, not physical-device measurements.

CI uses `contents: read`; it never commits, tags or publishes. The separate `pages.yml` uses **manual dispatch on main only**; merging a PR doesn't publish Pages. The optional heavy C7 browser benchmark is only run by selecting `run_c7_benchmark` on a manual Mappo CI dispatch.

See [G4 acceptance](plans/0.2/G4_ACCEPTANCE_REPORT.md), [current roadmap](ROADMAP.md) and [desktop implementation plan](plans/0.2/G1_G4_IMPLEMENTATION_PLAN.md).
