# D4 acceptance and responsiveness report

**Status:** D4 branch acceptance evidence collected; the full PR review-ready CI gate must pass before merge. **Baseline:** [pre-D4 main 42b295a](https://github.com/xbwtyz/Mappo/commit/42b295aee524ba7cbf7354174c68bb47e54275d8). **Candidate:** `0.2-dev.d4`, schema 9, modular sources and generated offline standalone.

## Coverage and safety contract

The existing Node suites and `scripts/road-browser-qa.mjs` already exercise:

- Generated-only road moves, all four city morphologies, junction/bend editing, connection topology, blocked drafts and named custom-building decisions
- Desktop, ultrawide, tablet and phone viewports under Chromium and Firefox; real pointer clicks, simulated touch, keyboard nudging and focus, grouped impact report, Details collapsed by default
- Accepted data isolation during preview, Reset and Cancel, exact single Apply revision, atomic Undo/Redo, portable save/reopen, stale preview rejection and authorized custom-building placement

D4 adds `scripts/d4-browser-acceptance.mjs` to the **full** browser command. It verifies a developed **Large Organic** city (seed `c2-organic`, `N-0145` X+8), on Chromium and Firefox **desktop and phone**, including: independent preview verification, visible status/accessible descriptions, keyboard focus traversal, Details closed, no uncommitted save/recovery mutation, Reset/Cancel, and no page overflow. It also checks a developed **Small Planned** schema-9 project where older properties and buildings lack provenance; an unsupported road move stays blocked without modifying accepted records. The existing suite exercises the four city morphologies and custom-building Apply paths.

**Focused evidence:** [D4 acceptance workflow](https://github.com/xbwtyz/Mappo/actions/runs/44696676423), **10/10 targeted Node** and **4/4 additional Chromium/Firefox viewport cases**, all passing. Original first-run test-harness issues (mobile inspector already collapsed, browser-specific scroll-container tab stop) were corrected; no engine validation rules changed.

The standalone compiler emits byte-identical `index.html` and `dist/mappo-0.2-dev.d4.html`. Offline runtime remains dependency-free. Full `npm run check`, `npm run test:browser` and built-artifact parity are enforced by PR CI. No mandatory tours, participant recruitment, physical-owner check, prompts or forced user interaction.

## Same-runner C7 responsiveness comparison

`scripts/d4-compare-performance.mjs` compares raw `scripts/c7-browser-performance.mjs` results by browser / viewport / city size with matching case counts. In **each** comparison, the frozen baseline and D4 are measured sequentially on **one** Ubuntu runner with identical Playwright 1.56.1 browser installs, Node 22, fixture seeds and parameters. A second complete run checks repeatability. Different CI runners served the two attempts; compare **within each attempt**, not across machines.

| Group | First run: preview baseline → D4 (ms) | Repeat: preview baseline → D4 (ms) | Repeat: worst frame gap baseline → D4 (ms) |
| --- | ---: | ---: | ---: |
| Chromium desktop Small | 445.3 → 445.3 | 376.2 → 366.6 | 16.7 → 16.8 |
| Chromium desktop Large | 1257.9 → 1248.0 | 884.1 → 917.6 | 150.0 → 116.7 |
| Chromium phone Small | 456.6 → 455.7 | 361.4 → 358.0 | 16.7 → 16.8 |
| Chromium phone Large | 1259.4 → 1261.9 | 893.0 → 895.6 | 116.7 → 116.7 |
| Firefox desktop Small | 468.5 → 477.0 | 386.5 → 386.0 | 17.3 → 17.1 |
| Firefox desktop Large | 1374.5 → 1391.5 | 978.5 → 975.5 | 150.1 → 149.8 |
| Firefox phone Small | 469.0 → 480.5 | 384.5 → 384.5 | 17.1 → 17.4 |
| Firefox phone Large | 1363.5 → 1390.5 | 982.0 → 968.0 | 134.0 → 149.8 |

**Preview medians:** −0.8% to +2.5% in the first run; −2.6% to +3.8% in the repeat. No sustained >20% and >100 ms median-preview/Apply regression review flag was observed. Baseline and D4 ran the same C7 safety scenarios in both runs.

**Outlier, disclosed:** In the first run, Firefox phone Large measured a maximum frame gap of **334 ms baseline versus 1,383 ms D4** and a worst key-command gap of **353 ms versus 1,500 ms**. The same scenario in the second run measured **134 versus 150 ms** and **138 versus 121 ms**, respectively. This single worst-case spike did **not** reproduce; neither run establishes statistically significant speed differences. The first runner used Xeon 8370C and the second Xeon 6975P-C, each with four logical CPUs and about 15 GiB memory.

**Reproducibility and raw evidence:**
- [First same-runner comparison, including raw JSON/artifact](https://github.com/xbwtyz/Mappo/actions/runs/44697123332/artifacts/14611327463)
- [Repeat comparison, including raw JSON/artifact](https://github.com/xbwtyz/Mappo/actions/runs/44697123332/artifacts/14612295666)
- [Benchmark run and logs](https://github.com/xbwtyz/Mappo/actions/runs/44697123332)

The comparison is a targeted **non-regression check**, not a speedup claim. Input stalls in large cities remain tracked in [issue #44](https://github.com/xbwtyz/Mappo/issues/44). Synthetic browser automation cannot replace physical-device timing or a human screen-reader audit; neither is a mandatory D4 acceptance interaction.

## Merge gate

1. Full Node and Chromium/Firefox browser CI completes successfully on D4's current PR head.
2. Built root `index.html` and versioned `dist/mappo-0.2-dev.d4.html` remain checked in and byte-identical.
3. No weakening of schema-9 validation, older custom-data protection, atomic Apply, Undo/Redo, or save/recovery behavior.
4. D4 PR remains unmerged and unreleased until separately approved.
