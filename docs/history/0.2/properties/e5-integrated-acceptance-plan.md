# Mappo 0.2E — E5 Integrated Property Editing Acceptance Plan

> **Status (2026-11-20): proposed for owner review, no implementation authorized by this plan.** E1 ([PR #58](https://github.com/xbwtyz/Mappo/pull/58)), E2 ([PR #60](https://github.com/xbwtyz/Mappo/pull/60)), E3 ([PR #62](https://github.com/xbwtyz/Mappo/pull/62)) and E4 ([PR #64](https://github.com/xbwtyz/Mappo/pull/64)) are merged into `main`. E5 closes the **0.2E milestone only**; it does **not** tag, publish, or release Mappo 0.2.

## Purpose

E5 is **integration hardening, not a fifth property-editing feature**. Validate the road-first → adapted neighborhood → authored property → plot count → buildings/access → Undo/Redo → portable save/reopen chain, correct proven defects in existing modules, and make developer/owner acceptance evidence clear and reproducible. Preserve schema 9, format 1, non-destructive preview, strict authored identity/metadata safeguards, and the single offline HTML distribution. Avoid forced tours, prompts, special owner QA tasks, duplicated editors, broad refactors or feature expansion.

## Proposed checkpoints (one implementation PR from updated main)

### E5-A — Integrated fixture and test harness

- Reuse existing deterministic city-model fixtures and **existing** Node and Playwright infrastructure. Add a thin shared E5 fixture/test helper **only** where it eliminates duplicated setup across scenarios.
- Build deterministic representative states for **planned, organic, linear and radial**, in **Small and Large** city sizes, plus a valid legacy schema-9 portable project.
- Include pristine generated sites, adapted road neighborhoods, manually created sites, E2 split siblings, E3 merged sites, E4 changed plot counts, buildings with valid entrances/access, user-authored/unknown metadata, landscapes and protected civic references.
- Establish explicit before/after snapshots for all untouched roads, lots, buildings, open spaces, districts and metadata. A fixture that cannot legally satisfy the selected operation should log a **real blocker**, not silently skip a required acceptance category.

### E5-B — Cross-editor data and history integrity

- Node acceptance of sequences **road editing/controlled adaptation → create property → split → merge (when eligible) → add/remove plot divider → Apply → Undo/Redo → portable encode/decode**. A disjoint sequence may be used for incompatible geometry, but must declare that limitation and preserve the same protected-record assertions.
- Ensure no lost IDs, orphan plots/buildings, stale plot-to-building ownership, invalid frontage or access paths, unexpected landscape/open-space modifications, or duplicated/erased `propertySplitHistoryE2`, `propertyMergeHistoryE3`, `plotCountHistoryE4` lineage.
- Verify explicit consent for protected retiring identities, including decline/cancel, unknown metadata and unsupported lineage cases.
- Check selection changes, concurrent/stale revisions, editor mode switches and load/regenerate clear draft/history appropriately. Exactly one accepted revision/history transaction for each Apply; cancellation creates none. Distinguish per-editor session history from a guaranteed global interleaved undo chain—**do not claim global Undo support where it doesn't exist**.
- Audit changing plot counts after E3, editing plot geometry after E2 and re-running road adaptation afterward. Correct only confirmed regressions, with targeted tests.

### E5-C — Browser workflow and interaction acceptance

- Chromium **and** Firefox, both desktop (1440×900) and phone (390×844 with touch), without external network access.
- Use real map/Inspector interactions (no forced clicks or simulated bypass of obstructing UI) for starting and cancelling E1–E4 edits, previewing candidate geometry, reviewing protected metadata consent, Apply, Undo/Redo and save/reopen.
- Verify no hidden panels, intersecting mobile drawers, unreachable buttons, broken focus/keyboard Escape, pointer interception or horizontal overflow during previews; expand existing browser checks only where coverage is missing.
- Validate that unrelated map interactions remain available when an editor is not active. No forced walkthroughs, tutorials or owner-run steps.

### E5-D — Performance and architectural review

- Measure interactive preview, validation, Apply and Undo latency on deterministic Small/Large fixtures relative to the **current road-editor baseline** on the same runner. Record hardware/runner context, fixture, percentile and explicit thresholds; do not invent a speedup.
- Review duplicate validators, document encoding, history stacks, data reconciliation and UI adapters. **Reuse existing shared modules** and remove only verified redundant E1–E4-specific code with regression evidence. Avoid destabilizing previously frozen legacy paths.
- Maintain performance issue [#44](https://github.com/xbwtyz/Mappo/issues/44) as a **separate** ongoing Large-city optimization concern; E5 does not promise to resolve it or introduce a performance-driven schema change.

### E5-E — Final milestone acceptance and documentation

- Run complete `npm test`, `npm run build`, and permanent Chromium/Firefox browser QA. Verify `index.html` byte-identical to `dist/mappo-0.2-dev.e5.html` and offline startup.
- Update `README.md`, `docs/README.md`, the 0.2 master roadmap, all E acceptance reports and the user guide **after verification**, distinguishing merged implementation from historical acceptance gates.
- Create an **E5 acceptance report** with exact CI links, fixtures, test outcomes, limitations, unresolved bugs and performance observations.
- Ensure no temporary CI workflows, generated test artifacts or credentials remain. Open a single reviewable E5 implementation PR. Require latest-head CI green, review and **separate explicit owner approval to merge**; do not tag/publish Mappo 0.2 from the E milestone.

## Critical acceptance matrix

| Domain | Must demonstrate |
| --- | --- |
| E1 property creation | valid empty/buildable land, immutable accepted neighbors, undo and portable reopen |
| E2 property split | supported convex quad, left ID retained/right ID new, authored metadata consent, protected buildings |
| E3 property merge | exact common-edge legal union, primary ID preserved, complete retired record audit and blocked unsupported geometry |
| E4 plot count | deterministic split/merge plot IDs, consent for annotated records, exact footprint-derived building memberships |
| Road→property integration | adapted street locations remain authoritative; no stale source application or silent authored-data destruction |
| Save/schema | schema 9 and portable format 1; custom/unknown fields and lineage unchanged on reopen |
| History | no draft mutation; each Apply exact accepted transaction; Undo/Redo returns proper prior state and cannot cross unrelated accepted changes |
| Browser | Chromium/Firefox desktop/phone; no blocked tap targets, hidden panels, forced clicks or client errors |
| Performance | controlled Small/Large baselines and reported measurements; no unsupported improvement claims |
| Packaging | root and versioned standalone byte-identical; offline operation |

## Explicit limits and sequencing

- Existing geometry restrictions remain intentional: E2 straight four-corner splits, E3 full-edge four-corner merges, E4 one divider per Apply; E5 will **not** silently loosen these into polygon boolean editing.
- General cross-editor history redesign, arbitrary parcel reshaping, building wings/holes or civic authoring are **not** E5 and require independent planning.
- After E5 is merged, plan **0.2F advanced 2D building design**; optional 0.2G civic places and 0.2H release hardening remain separate milestones.
- Historical CI failures, cancelled superseded workflows and older acceptance reports are not active blockers once latest-head permanent CI proves green, but documentation must record their status accurately.

## Owner review/merge gates

1. Approve this E5 scope and the explicit **integration-not-feature** boundary.
2. Create `feature/mappo-0.2e-e5-integration` from updated `main` and implement all E5 checkpoints with reusable tests and minimal targeted repairs.
3. Review the E5 implementation PR and its final acceptance report; verify latest-head permanent CI green.
4. Separately authorize merge. **No 0.2 release, tag, schema migration or publication** is implied.
