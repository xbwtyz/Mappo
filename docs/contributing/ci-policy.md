# Mappo continuous integration and test cadence

## Policy

GitHub Actions runs the full automated suite at review and release gates.
Use focused local tests when reproducing or diagnosing a failure. An incremental pass is **not** accepted for merge
until the full validation passes for the exact review-ready revision.

| Event | Checks |
| --- | --- |
| Feature/chore/fix/refactor/release branch push | Mappo Fast Checks: changed-JS syntax, reproducible standalone build and byte parity, representative Node smoke tests plus directly modified Node test files |
| Branch push while an open PR is ready for review | Only a lightweight PR-state lookup on the fast workflow; full Mappo CI handles the substantive tests |
| Draft PR, ordinary head commit | Full CI skips expensive validation; fast branch checks remain active |
| Draft PR, head commit message contains `[full-ci]` | Full six-runner CI on the exact PR head; skip duplicate fast tests |
| Draft PR, head commit message contains `[full-ci-benchmark]` | Same full CI plus the heavy C7 benchmark; skip duplicate fast tests |
| PR opened, updated or changed to ready-for-review status | Mappo CI: all Node tests, standalone reproducibility and Chromium/Firefox browser matrices |
| Push to main / merge queue | Mappo CI: same full validation |
| Manual Mappo CI dispatch | Same full validation with an optional C7 benchmark toggle |

The full CI workflow's name **Mappo CI** and check name
**Build, Node tests and browser QA** are deliberately retained to avoid
breaking release-workflow compatibility or existing required status checks.

**Future legacy-save policy:** v0.2.0's historical schema 1–8 migrations and tests remain active. The owner has disabled a **standing obligation to support every older save in future versions**, not authorized deletion of existing code, tests or fixtures. Any future change to save support must have a separately approved data-policy/CI proposal, explicit safe rejection and appropriate new tests. See [Development Rules](development-rules.md) and [Project Format](../reference/PROJECT_FORMAT.md).

## Browser execution environment and timing

Four browser jobs use the official version-matched Playwright 1.56.1 Noble container, with the same test-only JS package. System dependencies and browser binaries are preinstalled; missing executables fail the job. Two Node shards, six parallel runners and the required aggregate gate remain unchanged. The authoritative browser assignment is scripts/browser-suites.json, guarded by an independent inventory test. The sequential timed runner records every script, reports any failure as nonzero, and saves artifacts/ci-timings/*.json plus job summaries. All existing scenarios remain scheduled. See [CI optimization plan](ci-optimization-0.2.19.md) for baseline, acceptance and rollback.

## Desktop browser acceptance from 0.2G

The [desktop workspace plan](../history/0.2/workspace/milestone-0-2g-desktop-ui.md)
sets the support target for 0.2G and subsequent updates. Cover desktop
Chromium and Firefox at laptop, desktop, and ultrawide viewport sizes, with
mouse, keyboard, and trackpad-style navigation. The workspace implementation
has transitioned routine acceptance toward desktop/laptop/ultrawide viewports; phone/tablet QA and
touch gesture acceptance are not current requirements. Historical acceptance reports record the coverage used for
their releases.

## C7 performance runs

The heavy C7 browser benchmark is **explicit opt-in only** via the `run_c7_benchmark` manual input or the `[full-ci-benchmark]` marker on the current head commit of an open PR. Ordinary PR validation still runs C7 browser correctness suites and all main regression tests.

The manual Mappo CI workflow also accepts the **run_c7_benchmark** option to
force it using the existing default-branch workflow.
The unused previous C7 benchmark workflow tied to the old finalization
branch has been retired. The script and benchmark data format remain intact.

## Local development

Run `npm run build` when preparing checked-in standalone HTML. Open or
update the review PR to run the full build, Node, and browser checks in GitHub
Actions. Use targeted local tests for failure diagnosis, such as
`node --test tests/road-preview.test.js`. Full GitHub CI is the authoritative
pre-merge acceptance check.

## Resource and safety safeguards

- Branch and PR runs have independent concurrency groups; stale runs in the
  same group are canceled.
- A matching exact-head ready PR or explicitly requested draft PR prevents duplicate fast test workloads on its branch pushes. Branches without an open PR (including a marker before opening one), ordinary draft heads, stale PR lookups and lookup failures retain fast checks. Opening or updating a PR evaluates the current head marker.
- Markers are case-insensitive literal tokens in the current commit message, not sticky settings; `[full-ci-benchmark]` takes precedence when both appear. A new ordinary draft head returns to fast checks. Review-ready PRs always run full CI and may opt into the benchmark by marker. Main and merge-group runs remain full, without marker-driven heavy benchmarking.
- The lightweight routing job must succeed; a routing failure or failed/skipped required matrix cannot produce a passing aggregate. Draft marker runs check out the exact PR head, while ready PRs retain normal merge-ref validation. Markers never change PR state or grant merge or release authorization.
- If checking for an open ready PR fails, fast tests run instead of silently
  skipping verification.
- Full PR validation runs when the PR is ready for review; draft-to-ready
  transitions retrigger it, as do subsequent head commits.
- No release, Pages publication, project schema, or application behavior is changed
  by this CI policy.
- **Owner approval** remains required to merge Mappo feature work.

## Historical P1 / performance issue status

This CI change was originally developed alongside the junction worker in [PR #45](https://github.com/xbwtyz/Mappo/pull/45). [Issues #44 and #46](../history/0.2/release/h3-performance-audit.md) were subsequently closed after the measured H3 review. Heavy C7 benchmarking remains opt-in, and connected dead-end road editing is tracked separately as [#79](https://github.com/xbwtyz/Mappo/issues/79).
