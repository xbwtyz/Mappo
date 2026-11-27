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
| Draft PR, head commit message contains `[benchmark-f4]` and/or `[benchmark-c7]` | Only the requested independent benchmark runners plus normal Fast Checks; full regression matrices and required aggregate remain skipped |
| Draft PR, head commit message contains `[full-ci]` | Full twenty-runner CI on the exact PR head; skip duplicate fast tests |
| Draft PR, head commit message contains `[full-ci-benchmark]` | Same full CI plus the heavy C7 benchmark; skip duplicate fast tests |
| PR opened, updated or changed to ready-for-review status | Mappo CI: all Node tests, standalone reproducibility and Chromium/Firefox browser matrices |
| Push to main / merge queue | Mappo CI: same full validation |
| Manual Mappo CI dispatch | Same full validation with an optional C7 benchmark toggle |

The full CI workflow's name **Mappo CI** and check name
**Build, Node tests and browser QA** are deliberately retained to avoid
breaking release-workflow compatibility or existing required status checks.

**Future legacy-save policy:** v0.2.0's historical schema 1–8 migrations and tests remain active. The owner has disabled a **standing obligation to support every older save in future versions**, not authorized deletion of existing code, tests or fixtures. Any future change to save support must have a separately approved data-policy/CI proposal, explicit safe rejection and appropriate new tests. See [Development Rules](development-rules.md) and [Project Format](../reference/PROJECT_FORMAT.md).

## Browser execution environment and timing

Four browser jobs use the official version-matched Playwright 1.56.1 Noble container, with the same test-only JS package. System dependencies and browser binaries are preinstalled; missing executables fail the job. Sixteen measured Node shards, four browser suites and the unchanged required aggregate gate comprise the full CI architecture. The authoritative browser assignment is scripts/browser-suites.json, guarded by an independent inventory test. The sequential timed runner records every script, reports any failure as nonzero, and saves artifacts/ci-timings/*.json plus job summaries. All existing scenarios remain scheduled. See [CI optimization plan](ci-optimization-0.2.19.md) for baseline, acceptance and rollback.

## Desktop browser acceptance from 0.2G

The [desktop workspace plan](../history/0.2/workspace/milestone-0-2g-desktop-ui.md)
sets the support target for 0.2G and subsequent updates. Cover desktop
Chromium and Firefox at laptop, desktop, and ultrawide viewport sizes, with
mouse, keyboard, and trackpad-style navigation. The workspace implementation
has transitioned routine acceptance toward desktop/laptop/ultrawide viewports; phone/tablet QA and
touch gesture acceptance are not current requirements. Historical acceptance reports record the coverage used for
their releases.

## C7 performance runs

The heavy C7 browser benchmark is **explicit opt-in only** via the `run_c7_benchmark` manual input, the `[full-ci-benchmark]` marker on the current head commit of an open PR, or `[benchmark-c7]` on an ordinary draft PR. Ordinary PR validation still runs C7 browser correctness suites and all main regression tests.

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

## Incremental standalone reuse (owner-approved November 25, 2026)

For ordinary draft development, retain the existing checked-in standalone pair when changes are demonstrably or reasonably expected to leave compiled output unchanged (documentation, tests, or detached source not included in the bundle). Commit the focused source/test changes directly to the draft branch; the existing Fast Checks build, byte-parity and clean-diff checks remain mandatory and authoritative for the exact head. Do not create a separate hosted compilation branch solely to reconfirm likely unchanged output. This is a workflow-cadence choice, not a cache-based substitute for compilation, a CI waiver, or permission to merge a mismatched artifact.

When source, template, style, worker bundling, build tooling or version changes are expected to affect generated HTML, produce the deterministic standalone pair before committing the reviewable candidate. If Fast Checks detects unexpected compiled drift, stop further implementation, generate the pair through the existing hosted build path, commit only the verified output from that exact source, and revalidate the exact new head. Never disable or weaken build, parity, clean-diff or test checks. Pure documentation-only updates follow existing CI policy and any separately authorized no-CI instructions. Full review-ready, main, release and offline validation gates remain unchanged. No workflow YAML or schema changes are authorized by this cadence improvement.

## Resource and safety safeguards

- Branch and PR runs have independent concurrency groups; stale runs in the
  same group are canceled.
- A matching exact-head ready PR or explicitly requested draft PR prevents duplicate fast test workloads on its branch pushes. Branches without an open PR (including a marker before opening one), ordinary draft heads, stale PR lookups and lookup failures retain fast checks. Opening or updating a PR evaluates the current head marker.
- Focused markers `[benchmark-f4]` and `[benchmark-c7]` may be combined on an ordinary draft head. Each selected job verifies exact-head compiled parity and runs its existing script in a separate Playwright runner; normal Fast Checks remain active. Full markers and ready-for-review state take precedence. Focused success is diagnostic only, never full qualification or a release gate. Existing F4 coverage in the full integration suite is retained.
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


## Incremental research comparison partitioning (owner-approved November 25, 2026)

Keep expensive independently measured research schedules in separate top-level `tests/*.test.js` files, rather than appending every new experiment to one ever-growing directly modified file. For the SRE road compression work, retain the original 18-case baseline in `tests/spatial-recovery-compression-baseline.test.js`, the 18-case grouped-first comparison in `tests/spatial-recovery-compression-grouped-first.test.js`, and the current eight-case diversified comparison in `tests/spatial-recovery-unified-compression.test.js`. Preserve exact test bodies, scenario inventories, fingerprint locks, independent verification, comparison assertions and diagnostic reporting. The first partition commit runs all moved tests because all three files are changed. Subsequent focused challenger commits modify their own test file only, using existing Fast Checks smoke and changed-test selection. New research schedules should have their own separate test files. No workflow selector, skip flag, exclusion, altered expectation or coverage deletion is introduced.

If shared engine behavior, a previously qualified scheduler or a common validation contract changes, explicitly requalify affected comparisons at a suitable verified checkpoint, using the existing full-CI gate when needed; a focused experimental result does not qualify earlier schedules on the new exact head. Do not treat old CI results as a substitute for exact-head full coverage. All partitioned files remain automatically included in `npm test` and the 16 full Node shards; keep the complete twenty-runner review-ready/main gates and aggregate unchanged. Request complete qualification before adoption, review-ready status, merge or release. This approval concerns only incremental test organization and cadence; the wider DEV-OPT plan remains deferred pending separate authorization.


## DEV-OPT P4 — exact-push focused selection

Fast Checks retain the existing ready/full-marker suppression, baseline smoke tests, standalone compilation and byte parity. The selector binds checkout to the exact pushed SHA, uses the complete before..after range for normal fast-forward pushes, and only narrows a single two-parent reconciliation (old branch is first parent, incorporated main is second) to the main-parent diff when that parent is reachable from fetched main and exact-main push CI independently shows all required routing/suite/aggregate jobs for that exact historical workflow (22 for the current architecture, eight for the previous architecture) passed in the same attempt. Verified single-parent new branches may use their main parent. Missing history, force pushes or unverifiable new branches use conservative full Node inventory; failed main-evidence lookups retain the push range. Unknown paths, shared contracts, fixtures and build inputs also select all Node tests; all directly changed tests plus baseline smoke remain mandatory. Named focused profiles cover roads, properties, buildings, SRE, schema/serialization, UI and infrastructure, with cross-domain expansion and conservative shared geometry escalation. This is incremental feedback, not full acceptance. All twenty full review-ready/main runners, exact merge-ref checks and aggregate name remain unchanged. Full job limit for the conservative single-runner fallback is 35 minutes; the ordinary focused path is expected to be much shorter. Read-only Actions lookup is used only for candidate main ancestry. Selection prints the exact range, mode, paths, profile and test inventory. No change to required CI trigger precedence.

Cadence: avoid running a full draft gate immediately before ready-for-review qualification; use ordinary focused draft iterations, then one review-ready full run on the final candidate and exact-main CI after separate merge approval. Existing full draft markers remain available for separately needed comprehensive diagnostic checkpoints. Do not suppress a review-ready/main gate, accept a canceled focused run as passing, or reuse stale results. Rollback by reverting this focused selector/workflow and policy changes through a reviewed PR. Workload balancing is a separate follow-up; no speedup is claimed until measured.


DEV-OPT timing: the 16 full Node jobs retain native file isolation and TAP, emitting a separate per-file timing report on Node 22. The explicit 16-shard Node Timing Pilot on the DEV-OPT draft is diagnostic only and never satisfies the full aggregate. Timing collection is not a test waiver; the complete inventory and original exit result remain mandatory. See the approved DEV-OPT plan for evidence and scope.


Measured Node assignments: scripts/ci-node-weights.json retains reviewed exact pilot evidence and the original reproducible two-shard proposal and weights used to derive the measured 16-shard assignment. All 16 mandatory Node runners validate the full inventory before executing their assigned native Node files and compare actual file summaries with their assignment. Any new or removed test requires a reviewed manifest refresh; no test can silently disappear. Native npm test and reference shard commands remain available. Full review-ready and main CI are still mandatory.


Browser balance update: move G4 cross-editor to property and H4 recovery to integration from desktop based on three successful run medians. Preserve all 37 independent scripts, existing runner names and optional benchmark position. Estimated maximum script sum 214.35s to 191.04s; actual performance pending final qualification. Roll back via the prior reviewed browser manifest if needed.


Owner-authorized 16-shard diagnostic (2026-11-26): the standing DEV-39 two-Node/four-browser mandatory allocation is a policy choice, not a platform limit. Evaluate 16 measured Node diagnostic shards using the explicit [node-timing-pilot-16] marker on PR162; preflight, exact checkout, standalone parity, native isolation, complete same-attempt inventory and per-assignment execution are required. No diagnostic result replaces a required full gate. Adopt any permanent runner-count change only after review of evidence and explicit owner approval. Do not overlap unnecessary full gates. Four browser suites, mandatory coverage and separate merge/publish approvals unchanged.


## Owner-approved full twenty-runner gate (DEV-39)

Effective on qualified merge of PR162: sixteen measured Node regression jobs plus the unchanged four browser suites, with routing and the existing `Build, Node tests and browser QA` aggregate outside the regression matrix. The aggregate first requires all twenty suite jobs to succeed, then checks out the exact tested revision, downloads same-run/same-attempt reports, independently validates 16 unique assignments and all actual executed files against the complete current inventory, and uploads completeness evidence. Missing, duplicate, failed, stale or cross-attempt evidence cannot pass. Preserve native Node file isolation, all original assertions and standalone parity. `scripts/ci-full-contract.mjs` defines current full-job names and same-attempt predicates. Historical two-shard evidence is recognized only for a historical exact workflow or historical metrics format, never current qualification. Explicit merge, release and Pages permissions are unchanged. A new/removed Node file requires a reviewed timing manifest refresh; no test is silently omitted. Rollback only through reviewed change with explicit approval and complete coverage.
