# Mappo 0.2.x — Engine Improvements Planning Pack

**Status:** Planning documentation approved for publication on a dedicated review branch; **not engine implementation authorization**. Prepared on November 21, 2026 based on the current merged `main` commit [`799532b6fb35`](https://github.com/xbwtyz/Mappo/commit/799532b6fb35669268c1b19c7bbef422230491a2) and [v0.2.0 release](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0).

The owner has selected the 0.2.x series to systematically resolve existing engine constraints, with the existing [Issue #79 — connected dead-end road deletion](https://github.com/xbwtyz/Mappo/issues/79) planned as **0.2.1**. **All four 0.2.1 architectural choices D-021-1 through D-021-4 are approved as A/A/A/A**; this does **not** approve application implementation, PR merge or publishing a release. The additional 17 GitHub Issues (#94–#110) are now **published as planning proposals**, not approved feature scopes. Future priorities and version assignments still require individual review. The existing Issue #79 was updated with its approved specification. No engine code, schema, CI workflow, release, or Pages change is authorized.

## Planning documents

| Document | Purpose | Review status |
|---|---|---|
| [0.2.x roadmap](ROADMAP_0_2X.md) | Direction, dependency waves, engineering and release gates | Initial proposal |
| [Engine limitations register](ENGINE_LIMITATIONS_REGISTER.md) | All 17 audited limitations; classifications and candidate priority | Initial proposal |
| [0.2.1 detailed plan](MILESTONE_0_2_1_DEAD_END_ROADS.md) | Issue #79 approved architectural boundaries, four internal checkpoints, technical investigations and acceptance | Architecture approved; implementation pending |
| [Issue #79 update draft](ISSUE_79_UPDATE_DRAFT.md) | Complete replacement GitHub Issue description for owner review | **Owner-approved for existing Issue #79** |
| [Group A — Roads](GROUP_A_ROAD_TOPOLOGY.md) | Road topology and safe street edits (A01–A06) | Initial proposal |
| [Group B — Parcels](GROUP_B_PARCEL_GEOMETRY.md) | Property polygons, splits, merges, plots and authored-parcel decisions (B01–B05) | Initial proposal |
| [Group C — Buildings](GROUP_C_BUILDINGS.md) | Compound structures and multi-operation drafts (C01–C02) | Initial proposal |
| [Group D — History/performance](GROUP_D_HISTORY_PERFORMANCE.md) | Undo architecture, frame timing and scaling budgets (D01–D03) | Initial proposal |
| [Group E — Files/export](GROUP_E_FILES_EXPORT.md) | Import capacity and whole-city PNG output (E01a/E01b) | Initial proposal |
| [Individual issue drafts](issues/) | 18 issue-linked planning records; A01 refers to existing #79 | **Issues published; coding not approved** |
| [Issue review guide](ISSUE_REVIEW_GUIDE.md) | How to collect reproduction, approval, labels and acceptance evidence | Proposed process |
| [Decision log](DECISION_LOG.md) | Owner-approved choices and open architecture decisions | Living record |

## Proposed course

1. **Maintain [Issue #79](https://github.com/xbwtyz/Mappo/issues/79):** the owner approved its [replacement description](ISSUE_79_UPDATE_DRAFT.md) and the four A/A/A/A architectural choices.
2. Issue #79 now has the approved specification; separately authorize the single implementation branch/PR when ready.
3. Discuss the remaining published tracking issues **one at a time**, refining their design and acceptance before scheduling implementation.
4. Assign later 0.2.x versions according to confirmed dependencies and value rather than guessing version numbers in advance.
5. After implementation approvals, use independent PR, merge, full CI and release/publishing gates.

## Why not all 17 are bugs

Only A01 is a confirmed **open reported issue**. Several other findings are deliberate protective restrictions or missing feature scope, while D02/D03 and E01a require fresh evidence before code changes. We should **retain safe failure behavior** until a more expressive engine can prove equal or stronger validity.

## Safety constraints

No changes to app source/CI/schema/releases during documentation discussion. Preserve one accepted 2D city, atomic validated Apply, authored IDs/data, offline one-file build, historic snapshots and current migrations unless separately approved. No mandatory phone QA, heavy C7 benchmarks on every PR or forced onboarding.

**Next discussion:** Refine the published engine limitations in [Group A](GROUP_A_ROAD_TOPOLOGY.md); the approved [0.2.1 plan](MILESTONE_0_2_1_DEAD_END_ROADS.md) remains implementation-pending.