# Parallel CI regression coverage

## Goal

Preserve the same required `Mappo CI / Build, Node tests and browser QA` check and existing full-regression coverage, while reducing the end-to-end validation time through independent runners. This is a CI-only refactor: it must not change shipped Mappo HTML, runtime behavior, or release policy.

## Baseline: before splitting

Measured from a successful November 21, 2026 main-branch run: [Mappo CI #44944031575](https://github.com/xbwtyz/Mappo/actions/runs/44944031575).

| Stage | Elapsed |
| --- | ---: |
| Build + Node regression | 2m 59s |
| Playwright install | 0m 38s |
| Sequential browser QA (15 scripts) | 4m 36s |
| Checkout, setup, verification, uploads | ~0m 24s |
| **Total** | **8m 37s** |

Other successful full-CI runs took approximately 8–11 minutes. The former browser command used `&&` between all 15 scripts; later scripts were not executed after a failure.

## Implementation

`.github/workflows/ci.yml` starts the Node build/regression check and three independent browser QA matrix jobs at the same time. Each browser job builds the standalone HTML locally, installs pinned Playwright Chromium and Firefox, and uploads failure evidence separately. The exact same 15 scripts from the old `test:browser` command are present, once each:

| Matrix suite | Scripts |
| --- | --- |
| `workspace` | `desktop-three-tabs-browser-qa.mjs`, `workspace-g2-browser-qa.mjs`, `road-browser-qa.mjs`, `c7-p2-browser-qa.mjs`, `c7-p3-offline-qa.mjs` |
| `property` | `building-footprint-f2-browser-qa.mjs`, `property-integration-e5-browser-qa.mjs`, `property-count-e4-browser-qa.mjs`, `property-merge-e3-browser-qa.mjs`, `property-split-e2-browser-qa.mjs`, `property-creation-e1-browser-qa.mjs`, `building-browser-qa.mjs` |
| `integration` | `browser-qa.mjs`, `d4-browser-acceptance.mjs`, `building-performance-f4.mjs` |

The `npm run test:browser` command still runs **all** browser scripts locally; the three `npm run test:browser:<suite>` commands are individually executable for debugging. Browser tests are parallel **across independent runners**, not within a script, preserving suite-level test order and diagnostic behavior.

The workspace and property suites each run both Chromium and Firefox wherever the underlying scripts already did. The integration suite retains its pre-existing browser coverage and the Chromium F4 benchmark.

Playwright 1.56.1 stays test-only and is pinned; browsers and npm downloads are cached, but each runner still invokes the dependency installer so required Ubuntu libraries remain available.

## Safety and merge gates

- All three browser jobs and the Node job must succeed. `fail-fast: false` allows independent failure evidence to finish, but never allows a partially passing PR.
- The final `validate` job retains the previous required status-check name: **Build, Node tests and browser QA**.
- `Mappo CI` retains its workflow name for downstream `workflow_run` consumers; only main-branch CI can trigger the existing stable-release workflow.
- Compiled standalone artifacts come from the Node build, checked against tracked distribution files as before.
- The full browser matrices remain on review-ready PRs, main pushes, merge groups and manual dispatch; draft PRs still skip full validation.
- C7 desktop browser performance checks remain manual, opt-in via `run_c7_benchmark`, and run only in the integration shard.
- The lightweight branch-fast workflow, GitHub Pages and release workflows are unchanged.

## Measured result: first parallel PR run

The first [parallel CI validation #44948061967](https://github.com/xbwtyz/Mappo/actions/runs/44948061967) succeeded on November 21, 2026, with every regression job and the unchanged required combined gate passing. Total workflow elapsed time was **3m 36s**, versus **8m 37s** for the baseline run: **5m 01s saved (58.2% less wall time)**. This first sample included cold Playwright caches. Browser evidence was uploaded for each suite, and the tracked standalone HTML artifact remained available.

This is one measured before/after comparison, not a guarantee for future executions. Cache-warmed confirmation and additional samples should be considered before treating it as a steady-state estimate.

## Acceptance and benchmark

1. Verify the YAML and `package.json` are valid, and all 15 original browser scripts remain reachable.
2. On the PR, check that the four independent jobs start and complete and the existing named gate reflects their combined result.
3. Confirm browser screenshots, F4 measurements and standalone HTML artifact remain available.
4. Record elapsed time from multiple successful full-CI runs and compare with the 8m 37s baseline. Aim for roughly 4–5 minutes, but treat this as a target, not a guaranteed result.
5. Obtain separate owner approval before merging or publishing.
