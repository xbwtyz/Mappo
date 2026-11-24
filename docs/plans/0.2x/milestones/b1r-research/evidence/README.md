# B1R research evidence archive

Committed result data, extracted from exact completed Fast Checks job logs on November 24, 2026, to avoid dependency on Actions log retention. Each line is JSON. No generated input project files or complete candidate project snapshots are claimed to be archived. Reproduce using the frozen baseline generator and exact experimental branch configuration; confirm SHA-256 source fingerprint matches the record. Compare case identities by [projectId, fingerprint, roadIds, offset], not by row ordering.

## Preservation-only results

Five `selective-*.jsonl` files contain all 800 distinct cases, including both acceptance and refusal, baseline outcome, candidate fingerprint, score, diagnostic budget stats, issues, and measured timing. Fields are selected from the original LARE_CASE payload, augmented with run and job ID. Null stats or score indicate the source reported none; they are not zero. Timing is in milliseconds. Exact run IDs: [45355805434](https://github.com/xbwtyz/Mappo/actions/runs/45355805434), [45356711166](https://github.com/xbwtyz/Mappo/actions/runs/45356711166), [45356722091](https://github.com/xbwtyz/Mappo/actions/runs/45356722091), [45356731663](https://github.com/xbwtyz/Mappo/actions/runs/45356731663), [45356743813](https://github.com/xbwtyz/Mappo/actions/runs/45356743813). First run commit 7505df19d638117cddfbd16e0ea89aacc6041402; other four commit 13de2a554db842bd84fa32e0086253ee2500d63a.

## Demolition results

Thirteen `demolition-<run>.jsonl` files contain the original LARE_DEMOLITION_CASE payload plus run and job ID. Twelve original runs cover 166 distinct cases, four strategies each (664 records, 5658 trials); the hybrid file adds 23 records and 159 trials. Each record contains the exact subset IDs, removed area, preview work, expansions, timing, outcome and successful candidate fingerprint. A null best denotes no successful trial. The individual trial's work is preview work, not total end-to-end cost. These are counterfactuals with original input clone removal, not production Apply against the original input. See [demolition study](../lare-demolition-study.md) for commit/run registry and limitations.

## Integrity checks at archival time

- 800 distinct preservation cases, 470 baseline accepted, 607 accepted, zero invalid or baseline regressions.
- 166 distinct demolition cases, each with exactly four original strategies, 101 unique recoveries; 23 distinct hybrid records with 17 recoveries.
- All source runs reported successful Fast Checks (60 tests passed). No full production CI claim.

Future updates should append new exact-run records, never replace an older experiment under the same filename. Distinguish verified complete runs from partial or failed runs. Keep summary reports aligned with the case archive and retain unsuccessful configurations in the research ledger.


## Deeper-removal evidence — partial round

- `demolition-45362362651.jsonl`: planned, 9 movements, 27 records, 134 trials, [run 45362362651](https://github.com/xbwtyz/Mappo/actions/runs/45362362651), job 138335339299.
- `demolition-45362373616.jsonl`: organic, 19 movements, 57 records, 280 trials, [run 45362373616](https://github.com/xbwtyz/Mappo/actions/runs/45362373616), job 138335402411.
- `demolition-45362385877.jsonl`: radial, 20 movements, 60 records, 283 trials, [run 45362385877](https://github.com/xbwtyz/Mappo/actions/runs/45362385877), job 138335438360.

All three runs exact commit b05c009c48927d55f99fe48faf0165c33662c525, 60/60 Fast Checks, zero reported invalid outcomes. 144 original case payloads plus run/job IDs, 697 trials. Verified 48 distinct identities against 664 original records, no overlap with 101 prior wins. 31 new distinct recoveries. Linear run 45362395263 pending at this checkpoint; not archived or counted. Earlier evidence unchanged.


## Deeper-removal final shard

- `demolition-45362395263.jsonl`: linear, 17 movements, 51 strategy records, 222 trials, [run 45362395263](https://github.com/xbwtyz/Mappo/actions/runs/45362395263), job 138338141994. Exact commit b05c009c48927d55f99fe48faf0165c33662c525; 60/60 Fast Checks; no invalid outcomes. All 65 remaining identities now accounted for, 195 records, 919 trials, 43 distinct recoveries. Prior evidence retained. Total archive: 800 preservation records, 882 demolition records (including hybrid), 6736 demolition trials, 22 JSONL files.


## Terminal parcel diagnostics and compact joint pilot

- `parcel-diagnostics-45365153567.jsonl`: 22 paired original/reduced diagnostic records, 22 subset trials, job 138344843550, exact commit 3e5d863784829f509f8b8bf9395cf3a466f69240. All identities and reduced work/expansions reproduced prior refusals.
- `parcel-compact-45365642330.jsonl`: nine paired original/reduced records, nine subset trials, job 138346538289, exact commit fcfcb7900f3c1531e14e424a1c13f90758036d9a. All identities and exact removal sets matched the diagnostic cohort; seven reduced-input recoveries, zero original-input recoveries.

Both Fast Checks passed 60/60. Raw case payloads plus run/job IDs are retained without overwriting earlier data. The two experiments add 31 diagnostic/counterfactual records and 31 subset trials; distinguish these from the original 882 demolition-strategy records and 6736 trials. Total JSONL files: 24.


## Compact expansion and witness pilot

- `parcel-compact-45366278402.jsonl`: planned, 5 records, job 138348698293.
- `parcel-compact-45366283090.jsonl`: radial, 3 records, job 138348715845.
- `parcel-compact-45366287308.jsonl`: linear, 5 records, job 138348730459.
- `single-witness-45365975725.jsonl`: ten intact records plus two explicitly marked incomplete raw truncated log lines, job 138347659665. Summary and 60/60 Fast Checks establish twelve witness reproductions; detailed evidence partial until chunked replay. Do not count the two raw fragments as complete records.

Compact runs exact commit 3995ebd062d321d01693a8356be7bc5c3f16c9f7, witness run a318dc35753d482c249fe5db3b73ad8ca562be26. Earlier datasets retained. All four runs passed 60/60 Fast Checks. Total JSONL files: 28.


## Interleaved placement and chunked witness replay

- `single-witness-45367006559.jsonl`: eleven complete records plus explicitly incomplete raw chunk and remaining chunk collection for planned-3; exact commit 85c6fe2aa8e665894adbb3ea8f795803fe27f2ae, job 138351208390.
- `interleaved-45367059266.jsonl`: twelve complete records, exact commit 67103d87b3e563fcda81b6ffd561e629dc6fcfdc, job 138351390240.

Both runs passed 60/60; twelve reduced-input successes each, zero original-input recoveries. Eleven complete matched pairs used for quantitative comparison. Preserve incomplete evidence as such. Total JSONL files: 30.


## Building-aware round 1

- `building-aware-results-45367799995.jsonl`: twelve intact compact result summaries, run 45367799995/job 138353964638, exact commit 2a90d8d99cad8004dbc9661b2c93b5752c3cb6cc; one preservation-only recovery, twelve reduced-input recoveries, 60/60 Fast Checks.
- `building-aware-payloads-45367799995.jsonl`: eleven complete base64 chunk collections, explicitly incomplete raw/missing chunk entries for one payload. Concatenate chunks then base64-decode UTF-8; verify against summary payloadHash. Transport-complete collections not yet independently hash-checked. Compact result records support measured outcomes regardless of incomplete full trace. Total JSONL files: 32.


## Rigid feasible-region round 2

- `rigid-region-results-45368589135.jsonl`: twelve intact result summaries, exact commit a27a468163eae9bb47b03d2cedba4216279cadf3, job 138356658199.
- `rigid-region-payloads-45368589135.jsonl`: twelve complete base64 chunk collections, emitted payload hashes available in result summaries, hash verification pending. Both datasets from 60/60 Fast Checks, one original-input recovery reproduced, twelve reduced-input recoveries, no incremental recovery. Total JSONL files: 34.
