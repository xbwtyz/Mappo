# CI browser optimization — approved plan and measurement contract

Approved November 23, 2026 (Pacific): CI-01 through CI-08 = A. Infrastructure-only; version 0.2.19-dev, project schema 10, portable envelope 1, workspace schema 1. No application, release, tag, Pages or merge authorization.

## Approved decisions

| Decision | Implementation |
| --- | --- |
| CI-01 | Browser jobs use official version-matched Playwright v1.56.1-noble image and JS package; no runtime apt installation |
| CI-02 | Two Node shards and four browser suites, plus unchanged aggregate gate |
| CI-03 | Rebalance existing scripts; no removed scenarios |
| CI-04 | Measure each script and suite; attach JSON and Actions summary |
| CI-05 | Preserve complete frozen A2 inventory and both browser engines, viewport, offline and history/persistence coverage |
| CI-06 | Keep version 0.2.19-dev and unchanged application/distribution |
| CI-07 | Keep full exact-head PR and post-merge main gates |
| CI-08 | Heavy C7 benchmark remains manual opt-in |

## Baseline and redistribution

[A2 PR #147 CI](https://github.com/xbwtyz/Mappo/actions/runs/45306074389), exact head 6e9682221a1d3fd023dccfcc211361ed56cff445: 776s elapsed, 612 Node tests, zero failed or skipped, all seven jobs green. Property installation 437s, test execution 301s, total 766s. Desktop setup 353s/test 138s; roads setup 14s/test 212s; integration setup 31s/test 153s. Cache hits did not prevent apt mirror delays; previous runs observed 14–452s installation. See [A1 PR CI](https://github.com/xbwtyz/Mappo/actions/runs/45300451926) and [A1 main CI](https://github.com/xbwtyz/Mappo/actions/runs/45304239283).

Move building-footprint-f2-browser-qa to desktop; courtyard-access and building-components to integration. Remaining parcel and property/identity workflows remain in property. All scripts retain their original content and browser loops. Exact baseline inventory is independently asserted in tests/ci-browser-suites.test.js. Future additions to routine CI must update both manifest and expected inventory deliberately.

| Suite | Old scripts | New scripts |
| --- | ---: | ---: |
| desktop | 7 | 8 |
| roads | 8 | 8 |
| property | 13 | 10 |
| integration | 4 | 6 |

## Verification and benchmark

- Compare the new manifest against the previous package commands; confirm exact 32 unique scripts, all present.
- Run all Node tests (including new manifest checks), both engines through all four browser suites and the existing aggregate gate; check exact SHA and byte-identical standalone. Test-runner failures or missing browsers fail CI, never silently skip.
- Record workflow elapsed, per-job duration including container pull/initialization, installation and test execution separately, and script timing artifacts. Compare to A2 baseline; first-run result is evidence, not a stable median. Goal 4–6 min, not a promised result.
- Version match image and JS package: https://playwright.dev/docs/docker and https://playwright.dev/docs/ci. Container execution is for trusted repository test code; no new credentials or permissions. C7 remains manual opt-in; container resource/font/system changes may affect benchmark comparability, so establish a new baseline before comparing absolute performance values.
- Rollback if startup or compatibility regresses: restore the browser setup stanza from baseline .github/workflows/ci.yml at 7d47545504b22cb7f6c4bcf159ecda3d5afe41d1 in a separately approved change (remove container, restore cache and playwright install --with-deps chromium firefox). Retain manifest/timing improvements if validated. No automatic success fallback or bypass of the aggregate gate.
- No merge until owner separately approves after exact-head CI and benchmark review.

## Results

Pending candidate CI. Do not report target or projected times as measured.
