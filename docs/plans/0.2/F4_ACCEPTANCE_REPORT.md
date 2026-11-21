# Mappo 0.2F F4 building integration acceptance

F4 closes the building editing milestone by exercising the existing road,
property, plot, building, and identity editors together. F1–F3 are merged
through PRs [#68](https://github.com/xbwtyz/Mappo/pull/68),
[#69](https://github.com/xbwtyz/Mappo/pull/69), and
[#70](https://github.com/xbwtyz/Mappo/pull/70).

## Acceptance checks

| Scenario | Evidence |
| --- | --- |
| E1 creation, E2 split, and E3 merge followed by a building edit | `tests/building-integration-f4.test.js` places a building and inserts a vertex on each processed property. It checks access and plot links and compares unrelated city records. |
| Building spanning an E4 plot divider | The same suite validates a placement and replacement, adds a wing and courtyard, changes the use, and restores geometry through scoped Undo and Redo. It checks the authored fields and recomputed plot occupancy. |
| Older history entries after later edits | The structural and plot history reject stale snapshots. The building geometry history restores its own fields and retains the later classification. The Inspector explains when structural Undo or Redo is blocked. |
| Road conflict on an edited outline | The established C5 road fixture rejects an unresolved or impossible choice. An authorized relocation preserves classification, authored text, and the edited outline. An unrecognized building field blocks reflow and remains intact. |
| Continuous browser workflow | `scripts/building-footprint-f2-browser-qa.mjs` combines a wing, courtyard, classification, geometry Undo and Redo, and a portable reopen in Chromium and Firefox at 1440×900 desktop and 390×844 touch. |
| Offline compatibility | The permanent CI rebuild checks byte parity between `index.html` and `dist/mappo-0.2-dev.f4.html`. Save tests check project schema 9 and portable format 1. |

## Performance evidence

`scripts/building-performance-f4.mjs` runs during browser CI. The
[branch's GitHub Actions runs](https://github.com/xbwtyz/Mappo/actions/workflows/ci.yml?query=branch%3Afeature%2Fmappo-0.2f-f4-building-integration)
include the measured p50/p95 values in the job summary and under
`f4/building-performance.md` and `f4/building-performance.json` in the browser
artifact. Each group uses nine measured samples after two warm-ups. The same
Chromium runner uses repeatable Small and Large planned cities.

The gesture metric measures the synchronous preview handler during a real
pointer event. Separate timings measure independent project validation and
Apply, Undo, and Redo through their synchronous interface updates. They
describe the measured runner and exclude painting and physical-device
latency. Direct vertex editing began in 0.2F, so these measurements establish
a baseline for that operation. [Issue #44](https://github.com/xbwtyz/Mappo/issues/44)
remains the separate large-city responsiveness investigation.

## Limits and review

An incompatible earlier structural edit requires returning to a compatible
state before replay. One topology change per building Apply still applies.
These cases cover representative legal editor sequences and explicit
conflicts. Phone results use browser touch emulation. F4 is an integration
checkpoint. The 0.2 release cycle remains under 0.2H.

The review gate is a passing permanent GitHub CI run on the current F4 PR head
followed by separate merge approval.
