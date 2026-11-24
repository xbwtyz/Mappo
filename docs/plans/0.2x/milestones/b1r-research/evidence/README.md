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
