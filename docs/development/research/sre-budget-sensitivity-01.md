# E2 budget sensitivity — isolated research evidence

Exact [run 45793690635](https://github.com/xbwtyz/Mappo/actions/runs/45793690635), harness 4a7aa30aaf3f75ca055e2b7824667ad841a7d579, target 2caf6c41a37c00d66c9d45e3e8cf2e68f2933bb2, derived from product 3b0b6dd6d3abac84ae7a1f15d261606c7e50d689. Eight verified deterministic replay tasks, zero faults, 244 seconds. No product change.

| Budget | Regular P/P/B | Irregular P/P/B | Regular work | Irregular work | Regular scale loss | Irregular scale loss |
|---|---|---|---|---|---|---|
| 32M | 16/22/16 | 16/28/16 | 30500000 | 30500000 | 0 | 0 |
| 64M | 13/18/15 | 13/24/15 | 61358519 | 62073850 | 1489.7826442536025 | 1387.642588546243 |
| 128M | 13/18/15 | 13/24/15 | 69918290 | 70858580 | 0 | 1387.642588546243 |
| 256M | 13/18/15 | 13/24/15 | 69918290 | 70858580 | 0 | 1387.642588546243 |

32M exact original fingerprints reproduced. 128M and 256M identical candidates, maximum RSS 367912 KiB across all tasks, 256M replay-inclusive elapsed 50.893s and 55.464s. Remaining work over 185M at 256M; fixed one-pass proposal inventory is the observed plateau, not evidence of geometric impossibility. Historical R27 used repeated improvement passes (up to 32, 64 calls); R29 used seeded shell/exchange refinement (96 calls), not directly comparable. Next compare original 256M one-pass vs iterative-256M, three bounded additional passes at most (alternate small-shell/diversified restore plus optimization, 45M/32M phase caps sharing the same parent, keep bind reserve and 131072 expansions). Existing proposal/trial caps, permission checks, unmodified independent verifier, no historical seed, no regeneration. Only strictly improved independently derived retirement cost replaces incumbent; stop after pass 2 on plateau or exhaustion. Extra research time is not production SLA. No production cap change or approval for adoption.
