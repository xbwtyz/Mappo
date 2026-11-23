# Mappo continuous integration and test cadence

## Policy

GitHub Actions runs the full automated suite at review and release gates.
Use focused local tests when reproducing or diagnosing a failure. An incremental pass is **not** accepted for merge
until the full validation passes for the exact review-ready revision.

| Event | Checks |
| --- | --- |
| Feature/chore/fix/refactor/release branch push | Mappo Fast Checks: changed-JS syntax, reproducible standalone build and byte parity, representative Node smoke tests plus directly modified Node test files |
| Branch push while an open PR is ready for review | Only a lightweight PR-state lookup on the fast workflow; full Mappo CI handles the substantive tests |
| Draft PR | Full CI skips expensive validation; fast branch checks remain active |
| PR opened, updated or changed to ready-for-review status | Mappo CI: all Node tests, standalone reproducibility and Chromium/Firefox browser matrices |
| Push to main / merge queue | Mappo CI: same full validation |
| Manual Mappo CI dispatch | Same full validation with an optional C7 benchmark toggle |

The full CI workflow's name **Mappo CI** and check name
**Build, Node tests and browser QA** are deliberately retained to avoid
breaking release-workflow compatibility or existing required status checks.

**Future legacy-save policy:** v0.2.0's historical schema 1–8 migrations and tests remain active. The owner has disabled a **standing obligation to support every older save in future versions**, not authorized deletion of existing code, tests or fixtures. Any future change to save support must have a separately approved data-policy/CI proposal, explicit safe rejection and appropriate new tests. See [Development Rules](development-rules.md) and [Project Format](../reference/PROJECT_FORMAT.md).

## Desktop browser acceptance from 0.2G

The [desktop workspace plan](../history/0.2/workspace/milestone-0-2g-desktop-ui.md)
sets the support target for 0.2G and subsequent updates. Cover desktop
Chromium and Firefox at laptop, desktop, and ultrawide viewport sizes, with
mouse, keyboard, and trackpad-style navigation. The workspace implementation
has transitioned routine acceptance toward desktop/laptop/ultrawide viewports; phone/tablet QA and
touch gesture acceptance are not current requirements. Historical acceptance reports record the coverage used for
their releases.

## C7 performance runs

The heavy C7 browser benchmark is **manual opt-in only** via `run_c7_benchmark` on the Mappo CI workflow. Ordinary PR validation still runs C7 browser correctness suites and all main regression tests.

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
- A ready PR prevents duplicate fast test workloads on its branch pushes,
  while draft PR development continues to receive smoke feedback.
- If checking for an open ready PR fails, fast tests run instead of silently
  skipping verification.
- Full PR validation runs when the PR is ready for review; draft-to-ready
  transitions retrigger it, as do subsequent head commits.
- No release, Pages publication, schema-9, or application behavior is changed
  by this CI policy.
- **Owner approval** remains required to merge Mappo feature work.

## Historical P1 / performance issue status

This CI change was originally developed alongside the junction worker in [PR #45](https://github.com/xbwtyz/Mappo/pull/45). [Issues #44 and #46](../history/0.2/release/h3-performance-audit.md) were subsequently closed after the measured H3 review. Heavy C7 benchmarking remains opt-in, and connected dead-end road editing is tracked separately as [#79](https://github.com/xbwtyz/Mappo/issues/79).
