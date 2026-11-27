# DEV-OPT — Development Pipeline Optimization

**Status:** Owner-approved architecture, phased plans and acceptance criteria; implementation deferred.
**Approval date:** 2026-11-25 (America/Los_Angeles).
**Scope:** Development infrastructure only. This record does not authorize implementation, merging, releasing, tagging, publishing Pages, changing schemas or weakening tests.

## Owner decision

The owner selected DEV-OPT-01, 02, 03, 04, 05, 06, 07, 10, 11 and 12, approved phases P0–P5 and SAFE-01–SAFE-15, and explicitly deferred implementation until appropriate verified checkpoints and separate authorization. OPT-08 (parallel feature workstreams) and OPT-09 (higher-performance runners) remain outside scope. On 2026-11-25 the owner separately authorized adding this documentation to the current development branch with no CI run for this documentation-only commit. The next qualifying code revision still requires normal exact-revision checks; this commit is not a qualification or merge authorization.

## Purpose and existing foundations

Reduce repeated work, CI feedback time, research turnaround, approval interruptions and context-transfer effort without reducing correctness, safety or owner control. Retain modular offline single-HTML architecture, deterministic compilation, two Node shards and four browser runners, Firefox/Chromium, independent inventory checks, full review-ready and post-merge CI, the existing required aggregate check, GitHub-first validation and explicit publishing gates.

References: [development rules](../../contributing/development-rules.md), [CI policy](../../contributing/ci-policy.md), [CI guide](../../contributing/ci-guide.md), [SRE PR #155](https://github.com/xbwtyz/Mappo/pull/155), [GitHub-first policy PR #154](https://github.com/xbwtyz/Mappo/pull/154), [hosted build PR #157](https://github.com/xbwtyz/Mappo/pull/157). PR #157 reports successful isolated no-op and changed-output qualification but is a separate unmerged draft at planning time; verify current state and evidence before reuse. Do not treat historical PR descriptions as current qualification.

## Phased plan and acceptance gates

### P0 — Baseline and safe checkpoint (Low)

Trigger: next verified development checkpoint, with separate implementation authorization. Verify branch, source revision, approvals and CI evidence; inventory workflows, scripts, tests, fixtures and research infrastructure; measure historical CI durations, failures, duplicated workloads and research throughput; record coverage and preservation guarantees; identify conflicts and rollback points. Do not interrupt an active recovery experiment or treat a skipped check as a passing check.

Acceptance:
- [ ] Current development state and existing test inventory accurately recorded.
- [ ] Evidence-based baseline performance report and rollback points completed.
- [ ] No unresolved conflict with active SRE development; no application behavior change.

### P1 — Workflow optimization (Low–medium)

Trigger: P0 complete; safe checkpoint and separate authorization. Suggested packaging: policy PR and, if substantial, a separate tooling PR.

**OPT-01 Intelligent implementation batching:** classify tasks by dependencies, affected systems and risk. Low risk: typically 3–5 compatible tasks; medium: 2–3 closely related tasks; high: independent implementation and validation; critical: separate approval and dedicated testing. Sizes are adaptive, not quotas. Schema, preservation, topology and destructive operations require special care. Use targeted checks during development; retain full CI at review and main.

**OPT-02 Bounded implementation approval:** define exact scope, tasks, acceptance criteria, permissions and stop conditions. Within an explicitly authorized sequence, routine implementation, related tests, in-scope fixes, CI diagnosis, documentation and subsequent approved tasks can proceed. Stop for architecture/schema changes, scope expansion, weakened safeguards, destructive policy changes, PR merges, releases/tags/deployment or material ambiguity. Authorization expires at completion or a mandatory stop; it never grants unattended execution, new scope or automatic publishing.

**OPT-03 Persistent checkpoints:** versioned, independently validated machine-readable records containing milestone/version, branch/source revision, approval scope, completed/pending tasks, CI/artifact evidence, decisions, regressions/blockers, rollback and next authorized action. Detect stale checkpoints by checking GitHub independently; checkpoint text is not new authorization. Avoid self-referential commit hashes by identifying the verified source revision separately from the checkpoint commit.

**OPT-11 Performance tracking:** use actual GitHub evidence to track median and p90 full CI duration, runs per batch, failures, duplicated workloads, runner minutes, research scenarios/minute, approval interruptions and handoff/acceptance effort where measurable. Distinguish missing, canceled and incomplete evidence; compare comparable workloads/environments and record methodology.

Acceptance:
- [ ] Risk classifications, batching and approval boundaries documented and compatible with existing rules.
- [ ] Checkpoint schema independently validated, stale-state rejection demonstrated and fresh-session reconstruction verified.
- [ ] Baseline metrics generated from real evidence; no unnecessary duplicate CI runs.
- [ ] No application or save-format changes.

### P2 — Hosted build infrastructure (Medium)

Trigger: isolated infrastructure qualification, separately authorized; may progress independently of P1. Reuse PR #157, not a second build system. Review and reconcile with verified main; qualify permissions and branch restrictions, stale-source/concurrent-change rejection, artifact integrity, deterministic compilation, generated commits and CI triggering; document operation/fallback. Read-only build job and separately restricted recorder; only authorized generated paths on authorized branch, exact source SHA, no force push. Explicitly qualify workflow-token event suppression so generated commits cannot bypass required CI.

Acceptance:
- [ ] Two identical-source builds match; root and versioned HTML byte-identical.
- [ ] Only permitted generated files committed; no unnecessary no-op commit.
- [ ] Stale/concurrent branch changes, incorrect versions and artifact hashes rejected safely.
- [ ] Historical distributions retained; generated commits receive required exact-revision CI.
- [ ] No release/Pages authority; local compilation fallback documented and usable.

### P3 — Research harness and failure diagnostics (High)

Trigger: natural SRE research boundary, after relevant P1 foundations; separate authorization. Suggested PRs: research contract/runner, distributed execution/reporting, diagnostics.

**OPT-04 Automated research harness:** versioned manifests define source revision, strategy/version, fixture/corpus, seed, parameters, environment, execution budget and concurrency. Run independent candidate experiments in isolated jobs; aggregate completeness, evidence and results. Support SRE, roads, parcels, buildings, terrain, generation and eventually worker/3D experiments without bundling development tools into production. Use held-out fixtures to detect overfitting. Mandatory independent gates: topology/geometry validity, accepted-city nonmutation, permission compliance, deterministic outcomes and authored-data preservation. Only qualifying candidates may be compared on recovery success, generated-geometry preservation, time, search effort and memory. No automatic production adoption; missing/canceled/timeout results are not successes.

**OPT-07 Automated CI diagnostics:** preserve original assertion, stack/location, fixture, parameters, environment, exit status and log/artifact links; classify probable regression, environment/setup failure, timeout, nondeterminism or incomplete evidence. Root-cause conclusions remain provisional until reproduced/verified. Diagnostics must not turn failures into success or automatically alter code.

Acceptance:
- [ ] Multiple strategies in one submission; deterministic replay from recorded inputs.
- [ ] Invalid candidates rejected before comparative ranking; accepted city and production algorithms unmodified.
- [ ] Held-out fixtures, execution budgets and concurrency limits verified.
- [ ] Missing, canceled, failed and timed-out experiments reported accurately; reproducible evidence retained.
- [ ] Failure reports retain original errors/status; diagnostic failure cannot mask test failure.
- [ ] Separate production-integration authorization remains mandatory.

### P4 — CI optimization (Medium–high)

Trigger: SRE merged by separate authorization, full main CI verified, and P1 metrics available. Separate focused-workflow and balancing PRs.

**OPT-05 Subsystem-focused checks:** extend existing Fast Checks and focused benchmark routing with profiles for geometry, SRE, roads, properties, buildings, schema, serialization, UI and build. Dependency mapping selects relevant profiles; shared core/validators/contracts or uncertain dependencies escalate to broader checks. Existing full CI is not replaced. Preserve trigger precedence, cancellation behavior, exact candidate/merge-ref validation and required aggregate check identity.

**OPT-06 Timing-based workload balancing:** use existing per-script browser timing artifacts and comparable historical runs to propose assignments among four browser runners, retaining two Node shards. Suggestions reviewed and committed as reproducible manifest changes, not dynamic uncontrolled rewrites. Preserve independence, browser environment, fixtures and inventory; consider Node redistribution only with evidence and independent inventory validation. Measure critical path, median/p90 and runner-minutes before/after.

Acceptance:
- [ ] Complete mandatory test inventory preserved; missing/duplicate tests detected.
- [ ] Unknown dependencies escalate; focused checks cannot satisfy full qualification.
- [ ] Firefox/Chromium, offline standalone, deterministic build and exact-revision coverage preserved.
- [ ] Full six-runner CI on review-ready PRs and main; required aggregate name/release compatibility unchanged.
- [ ] Failed, missing, canceled or skipped mandatory jobs cannot yield a qualifying pass.
- [ ] Measurements justify redistribution; demonstrable improvement without unacceptable resource increases.
- [ ] Prior configuration recoverable.

### P5 — Manual acceptance automation and final qualification (Medium)

Trigger: supporting infrastructure stable, separately authorized. **OPT-10:** create candidate-specific downloadable acceptance packages containing exact standalone HTML, deterministic sample city fixtures, checklist, expected behavior/known limitations, bug-report template and manifest of version/source SHA/artifact hashes. Supply prepared SRE movement scenarios rather than requiring the owner to reconstruct test cities. Maintain actual manual acceptance distinct from automation; never mark it passed automatically.

Acceptance:
- [ ] Exact candidate and artifact integrity verified; fixtures load and are reproducible.
- [ ] Instructions include expected behavior, limitations and applicable Firefox/desktop/ultrawide scenarios.
- [ ] No private data; manual results clearly distinguishable and never automatically passed.
- [ ] All ten selected improvements jointly qualified; final baseline comparison and rollback procedures documented.

## Dependency matrix

| ID | Dependencies |
| --- | --- |
| OPT-01 / OPT-02 | P0 |
| OPT-03 | OPT-01, OPT-02 |
| OPT-04 | OPT-03, OPT-11 |
| OPT-05 | OPT-03, OPT-11 |
| OPT-06 | OPT-11 and existing timing artifacts |
| OPT-07 | OPT-03 and OPT-04 reporting contract |
| OPT-10 | OPT-03 and verified builds |
| OPT-11 | P0 |
| OPT-12 | Existing hosted-build PR #157 |

P0/P1 at the next verified checkpoint; P2 can be isolated; P3 at an SRE research boundary; P4 after SRE merge and verified main; P5 after stabilization. Each phase should deliver independent value rather than delaying feature development indefinitely. Inspect existing structure before introducing proposed locations such as docs/plans/dev-opt/, docs/development/checkpoints/, scripts/development/{checkpoint,metrics,diagnostics,acceptance}/, scripts/research/ or additional workflows. No application version bump is implied by this infrastructure milestone.

## Mandatory safety contracts (approved)

| ID | Contract |
| --- | --- |
| SAFE-01 | No unapproved application behavior changes. |
| SAFE-02 | No reduction in mandatory test coverage. |
| SAFE-03 | No weakened geometry or topology validation. |
| SAFE-04 | No modification of preservation guarantees. |
| SAFE-05 | No unapproved schema or data-format changes. |
| SAFE-06 | No automatic merges, releases or deployments. |
| SAFE-07 | No fabricated or inferred test successes. |
| SAFE-08 | No stale CI results accepted for newer revisions. |
| SAFE-09 | No uncontrolled workflow write permissions. |
| SAFE-10 | No production adoption of research candidates without approval. |
| SAFE-11 | No unnecessary repetition of hosted test workloads. |
| SAFE-12 | No modification or destruction of historical builds and fixtures. |
| SAFE-13 | No development-only infrastructure bundled into production unnecessarily. |
| SAFE-14 | Every phase has a documented rollback procedure. |
| SAFE-15 | Missing or inconclusive evidence cannot satisfy acceptance gates. |

## Proposed performance targets (not measured or guaranteed)

| Metric | Initial target |
| --- | --- |
| Full CI duration reduction | 15–30% |
| Unnecessary full CI runs reduction | 40–60% |
| Routine approval interruptions reduction | 50–75% |
| Handoff preparation effort reduction | 60–80% |
| Manual acceptance preparation reduction | 40–60% |
| Research throughput | 2–5× |
| Mandatory test coverage retained | 100% |

Revisit targets after P0 establishes a reliable baseline. Compare repeated comparable runs; disclose resource tradeoffs and uncertainty. Do not weaken tests to reach a target. If no measurable improvement, report that result and retain or restore the safer configuration.

## Authorization and closeout

Planning approval is not implementation approval. Verify current exact development checkpoint and obtain separate authorization before executing each applicable scope. Preserve explicit PR merge approval, exact-head review qualification, exact-main post-merge CI, separate release/tag/Pages authorization and existing development rules. A documentation-only skip marker does not change these requirements. All implementation acceptance boxes remain unchecked; no DEV-OPT implementation is authorized by this record.


## Revised delivery authorization — November 26, 2026

Owner expressly approved: "I approve the revised development sequence, including completing DEV-OPT before implementing road-only live SRE integration. Preserve all existing safety contracts, mandatory CI coverage and separate merge approvals. Begin after exact-main CI is verified."

Prerequisite satisfied: E2 PR155 merged at d73b63cd90ac89625ef00fc134257ecb585a3fc8; exact-main [45901957462](https://github.com/xbwtyz/Mappo/actions/runs/45901957462) passed all six mandatory suites and aggregate in 778 seconds. The E2 engine remains detached. Sequence: (1) verified E2 main, (2) reconcile/qualify four-runner research infrastructure PR161 and separately approve its merge, (3) OPT-05 focused subsystem checks, (4) OPT-06 measured CI balancing, (5) extend OPT-03 checkpoints to active/full-gate states, (6) OPT-10 exact-candidate acceptance packages and remaining DEV-OPT qualification, (7) offline road worker, (8) progress/Stop/Continue/cancellation/stale binding, (9) road-only universal Review and Apply activation, (10) road-specific qualification and manual acceptance before returning to E3 property/building, E4 water/terrain, E5 defense/district, E6 derived 3D and full cross-domain qualification. No other adapter or P1–P5 gate is waived.

Four-runner PR161 prior source 81f142525fd854eb8e224ab62a343cb066264c54: Fast Checks 45798064746 74/74; independent four-shard research campaign 45798179853, 45799089746, and 45800398650/45800405522/45800410134/45800446420/45800452109 demonstrated exact frozen targets and complete reports. Reconcile the five nonoverlapping infrastructure files with verified main, request focused checks at the new revision, then full review-ready CI before separate merge approval. Prior research evidence is not a substitute for exact-head CI.

Prioritize Node timing and redundant-run investigation in OPT-05/06/11. Observed [ready-transition PR run 45901951206](https://github.com/xbwtyz/Mappo/actions/runs/45901951206) 1201 seconds, overlapping the 778-second exact-main run after merge. Same source tree but different events/runner conditions. PR Node shard1 1182s (1174s test step), shard2 623s; browser jobs 216–335s. Main Node shard1 753s, shard2 555s; browser jobs 218–279s. No controlled attribution to hardware/queue/concurrency, but Node is the critical path and imbalance is observed. Measure per-file Node workload and exact inventory; rebalance two existing Node shards and four existing browser suites only where measurements justify. Do not waive review-ready or exact-main CI; assess eliminating duplicate draft full runs by directly qualifying review-ready candidates where existing policy permits. More mandatory runners, paid/private hardware, altered gate identity or weaker test coverage remain outside authorized scope. Sub-eight-minute full CI is an aspirational target, not a promise. Keep rollback and report actual comparable performance.

No automatic merge, release, tag, Pages, schema change, general worker pool or parallel independent feature workstreams. Implementation approval is bounded to this sequence and existing acceptance contracts; separate merge approvals and mandatory stop conditions remain in force.


### P4 focused selection checkpoint

PR161 merged and exact-main CI [45907375400](https://github.com/xbwtyz/Mappo/actions/runs/45907375400) green in 901s on 0f03dee0d1bb51a6e0e6bf6452896041ad1e917a. The prior Fast Checks [45904370396](https://github.com/xbwtyz/Mappo/actions/runs/45904370396) canceled after 737s: first-parent diff on reconciliation imported 15 SRE test files from main. Implement exact push range and qualified main-parent selection, conservative profiles, unchanged baseline/parity and full gates. Initial qualification pending. See CI policy for detailed fallback, cadence and rollback. Separate measured timing/balancing follows; no product changes.


### Combined DEV-OPT completion — owner approved

Owner approved consolidating the remaining DEV-OPT work in PR162 rather than repeating separate full review/main cycles. On exact focused head 39361d4dded89201d92cc6cb0596a3a97b954a8c, [Fast Checks 45909198296](https://github.com/xbwtyz/Mappo/actions/runs/45909198296) passed 108/108 in 75s (18 files, no unnecessary SRE compression). The prematurely requested full review workflow [45909623714](https://github.com/xbwtyz/Mappo/actions/runs/45909623714) was canceled by the owner; no acceptance credit. PR returned to draft. Complete timing, balancing, checkpoint and manual-package work on this branch with independently testable checkpoints and one final full review-ready gate; separate merge and full exact-main CI remain mandatory.

Node timing adds a second native Node 22 test:summary reporter alongside existing TAP, preserving process isolation, two mandatory native shards and all files. A single explicit [node-timing-pilot] submission measures the complete inventory across four independent diagnostic runners, not mandatory full CI. Require exact SHA, same run/attempt, successful file and aggregate counts, environment equality and complete unique inventory; incomplete evidence cannot qualify. Four diagnostic shards provide observed per-file weights, not a controlled two-shard wall-time speedup. Longest-first deterministic assignment proposes two groups from the measured weights; adopt only after review and exact inventory validation, then measure actual full CI. No additional mandatory runners. Browser timing evidence from 45901957462, 45905831737 and 45907375400 covers all 37 scripts; assess median weights and meaningful redistribution separately. No release, schema, application changes or weakened tests.


### Node timing pilot bottleneck and partition correction

Initial [Fast Checks 45909963144](https://github.com/xbwtyz/Mappo/actions/runs/45909963144) 112/113: nested CLI inherited NODE_TEST_CONTEXT; corrected fixture on c56d3ec7e660680b8f86c5086d9a873275bc3f03, [Fast Checks 45910377002](https://github.com/xbwtyz/Mappo/actions/runs/45910377002) 73/73, 68s. First diagnostic pilot 45909962942 failed shard 1 (same fixture); shards 2/3/4 successful, complete gate skipped, no full qualification credit. Shard wall seconds 208/628/342/238. Exact successful shard 2 report lists spatial-recovery-compression.test.js at 557.920s, including historical single-pass 126.804s, fixed reuse 111.889s and unified historical 100.102s. Three successful reports cover 140 files; evidence is incomplete. Under existing incremental research partitioning policy, split the old 15 tests into six files using one shared support module; retained every original registration and body byte-for-byte and existing timeouts, budgets, fixtures, independent validation and expected fingerprints. Independent inventory regression checks 15 registrations. Preserve all tests in native npm test and full qualification. Repeat four-shard diagnostic on the corrected partition to obtain complete measured weights; no full browser CI. This is a test organization change, not a change to SRE or its acceptance criteria. Predicted speedup unmeasured.


Partition validation correction: Fast Checks 45911278857 passed 128/129, with only the newly added source registration check failing; timing pilot 45911278812 shard 1 failed the same check. The check incorrectly expected a closing quote immediately after a name prefix; parameterized names retain an intentional trailing space. Replace it with independently frozen exact original registration lines, validated against all six current files before submission. Add a cheap exact-head reporter/inventory preflight dependency before all four diagnostic shards. No original compression assertions, timeouts, fixtures or budgets modified; the full gate remains unchanged. Prior failed timing run cannot qualify.


### Measured Node assignment — pilot accepted

[45912156352](https://github.com/xbwtyz/Mappo/actions/runs/45912156352) exact head c959c45cb8cfdc64984187f664924ddd568b4327 attempt 1 passed preflight, all four native diagnostic shards and completeness. Node v22.23.5/Linux/x64/4 available processors; 192 unique files, 1366 tests (one existing historical skip); shard wall seconds 205/220/697/361. The new compression partitions all passed, including previously timed-out historical comparison. Fast Checks 45912156359 passed in 77s. Observed total file durations overlap under native concurrency; the per-file sum is a scheduling weight, not wall time. The checked-in scripts/ci-node-weights.json preserves the exact complete aggregate evidence and deterministic longest-first two-shard proposal (96 files each, 1910847.879 vs 1910847.865 ms summed weights). The existing two mandatory Node jobs now run their explicit measured lists under the native Node test runner with unchanged default concurrency/isolation and TAP plus timing reports. Both independently validate the complete assignment against actual file inventory, fail on missing/duplicate/stale paths or altered assignments, and verify observed summaries equal the assigned list. A separate regression compares tracked inventory with runtime inventory and tests malformed manifests. The npm test native full inventory and legacy native shard commands remain unchanged for reference and rollback. New/removed tests must be deliberately reflected in the reviewed weights/assignment before full qualification; no silent fallback or omission. Browser runners and aggregate gate remain unchanged. No full CI requested yet; compare measured wall times at final review-ready/main qualification. No claim of sub-8-minute achievement. Rollback: revert measured assignment and runner changes to native shard partition, preserving timing and coverage.


### Balanced assignment focused verification and OPT-03/06 continuation

Exact head 826987261bd7f4eadf79fbf4416966e080b303b0 [Fast Checks 45913395460](https://github.com/xbwtyz/Mappo/actions/runs/45913395460) passed 116/116 in 77s; full routing-only 45913400066, no full qualification. Add V2 active/paused/review-ready/merged exact-main checkpoint contract with strict run/attempt, job and artifact binding; preserve V1. Browser medians from 45901957462, 45905831737, 45907375400: desktop 214.35s, roads 189.30s, property 163.57s, integration 175.85s summed script medians. Move only independent G4 cross-editor (10.83s) to property and H4 recovery (12.48s) to integration: estimated 191.04/189.30/174.40/188.33s. Maximum predicted script time reduced 10.9%; not a measured wall-time gain. All 37 scripts retained, independent frozen inventory unchanged, same containers and four runner names. Prefer two moves over wholesale repartition (theoretical max 187.09s); preserve most subsystem grouping. Browser is not current critical path. No full gate requested. No application changes.


### OPT-10 manual acceptance package

Exact focused head b295104820ca3f2c02d0ca81f30ce8ad8d606cf7 [45913697693](https://github.com/xbwtyz/Mappo/actions/runs/45913697693) 118/118 in 76s. Implement a deterministic candidate package with checked-in exact-source standalone parity, synthetic regular/irregular mappo-001 saves, selected road IDs and offsets, manual checklist and bug template, SHA256/byte manifest and explicit not-run/not-qualified status. Use current editor expectations; SRE is detached and future live activation has its own acceptance plan. Generation rejects stale checkout, invalid saves, content drift and nonempty output. No user data. Full Node shard 1 produces package after parity and tests; explicit [acceptance-package] Fast Checks marker exercises actual generation and upload without a full gate. Existing test file extended to avoid altering measured file inventory. V2 checkpoint records the verified prior source; after this commit it is historical and must not be treated as new-head evidence. Package checks pending. No product changes or new mandatory runners. Roll back by reverting generator, workflow hooks and documentation; retain all prior fixtures.


### Owner-directed restriction review and 16-shard diagnostic

Owner requested proactive discussion of materially restrictive standing rules, documentation of the new requirement, and continuation with 16-shard tests on 2026-11-26. Record requirement in AGENTS.md and detailed development rules. PR162 exact head c82ec8790354eebbb1d979e6e6e3b5180e6d4e4e Fast Checks 45913911902 passed 119/119 in 78s and uploaded manual package 15161686047. Full review-ready run 45914114087 was in progress when direction changed; return PR to draft and supersede with the measured 16-shard diagnostic. Do not claim interrupted full qualification. Use the already validated four-shard timing evidence to derive deterministic 16 assignments of all 192 files; explicit marker, preflight, same-attempt 16-report gate, per-shard inventory equality, no test omissions, native isolation and unchanged assertions/budgets. Repo is public. The two mandatory Node jobs and four browser runners remain until a permanent reviewed DEV-39 change is approved; no automatic merge/release. Measure wall time and runner usage; predictions are not results. Rollback by reverting diagnostic and rule documentation changes through review. No application changes.
