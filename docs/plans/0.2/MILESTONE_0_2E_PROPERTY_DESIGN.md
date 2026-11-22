# Mappo 0.2E — Manual Property Restructuring (completed design history)

> **Current status:** E1–E5 completed and merged through [PR #66](https://github.com/xbwtyz/Mappo/pull/66), and the City Designer was published as [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0). The original planning checkboxes below remain unchecked as **historical design criteria**, not outstanding work. For final completion, see the [master roadmap](README.md) and [E5 acceptance report](E5_ACCEPTANCE_REPORT.md).

## Purpose

Complete the land-editing foundation **before** advanced custom architecture. After reshaping streets in 0.2C/D, a user should be able to **create, split, merge and subdivide properties** within accepted blocks, and inspect exactly what will happen to related plots, buildings, identities and access before a single reversible Apply.

Normal path: **select land or property → choose an operation → edit the draft → review ownership and affected structures → Apply or cancel**. No onboarding, mandatory walkthrough, forced confirmation tour or participant recruitment.

## What is already implemented (reuse, do not duplicate)

- 3F/3F-Aa: property-first selection, related-building inspection, independent names and descriptions.
- 3I: non-destructive edits of existing property corners and **existing** plot dividers, validated Apply and session Undo/Redo; constrained to a fixed number of plots and the existing property.
- Dev 4a: property deletion with dependent-object restoration; Dev 4e: one-operation building clearing.
- 0.2B–D: accepted road topology/face analysis, provenance-aware local reconciliation, contextual impact reporting, blocked recovery and atomic road Apply.
- Existing schema-9 project validator, portable saves, local recovery, the shared canvas/Inspector, Chromium/Firefox QA and compiled single-file HTML.

This milestone fills the **structural** gaps. It must not recreate the property corner editor, building-transform tools or the road editor under new names.

## Non-negotiable preservation policy

1. **Accepted city is immutable during a draft.** Preview, locate, Reset, Cancel and invalid choices must not touch project, recovery, history or downloads.
2. **No invented ownership.** Every property belongs to an accepted block; every plot belongs to exactly one valid property; each building has verified property, plot, frontage and access references. Ambiguous mapping is a blocker, not an invitation to guess.
3. **No silent destruction or transfer.** Preserve names, notes, IDs and customized/legacy-unknown structures unless an explicit user decision authorizes an otherwise safe change.
4. **Geometry is validated as a coupled whole.** Block coverage, property adjacency and non-overlap, legal geometry, plot tiling, building containment, entrances, frontage and protected civic/landscape infrastructure remain authoritative. Roads are not silently moved by land edits.
5. **Identity and lineage are auditable.** Retain IDs for unchanged records; for split/merge, record source→successor mappings and make the policy for conflicting identities explicit before implementation. Never claim one-to-one mapping where none is provable.
6. **One independent Apply.** Revalidate current accepted revision, full project and schema-9 encode/decode; accept the entire connected edit as one revision and one Undo/Redo step or leave it unchanged. Do not copy uncommitted drafts into a portable project.
7. **Shipped 0.2.0 compatibility.** The milestone retained schema 9, existing supported migrations, property-first interaction, modular JavaScript, and reproducible standalone builds. Future blanket legacy-save compatibility is optional; any change to shipped behavior needs separate approval.

## Historical development sequence (completed E1–E5)

### E1 — Create a property in eligible land (merged PR #58)

- [ ] Reuse accepted block geometry and existing property/plot/empty-space records to show eligible locations. Let the user draw or adjust a candidate property with ordinary map gestures and numeric refinement, without spawning a new user flow.
- [ ] Begin with geometry already supported by the validator. Reject overlap, illegal boundaries, missing street access and unprovable residual open-space tiling with specific, locatable reasons.
- [ ] Create required plot and ownership references atomically; preserve neighboring properties and accepted streets. Establish deterministic ID allocation and ensure Undo/Redo and save/reopen.
- [ ] **Gate:** generated Small and Large cities, all four morphologies, multiple adjacent lots, and legacy schema-9 saves. Creating then cancelling leaves accepted project byte-equivalent.

### E2 — Split an existing property (merged PR #60)

**Approved design:** Single straight frontage-to-rear divider through an accepted four-corner property; both child parcels retain frontage. Original ID/name stay on the frontage-start successor; new ID for the other. Plot records are partitioned with deterministic, auditable ownership, and buildings never move physically. Crossing buildings block Apply; protected ownership transfers require explicit consent. Details, negative cases, module reuse, checkpoints and release gates are in [E2 property splitting contract](E2_PROPERTY_SPLIT_DESIGN.md).

- [ ] Preview a division line and both resulting parcels, including access, dimensions and dependent plots/buildings.
- [ ] Carry original names/uses and IDs only where the continued identity is unambiguous. Show explicit source/successor records and require an explicit choice for contested authored identities.
- [ ] Retain buildings in the verified parcel when possible. A building spanning the split line or an unassignable plot must block Apply until the user adjusts the draft or authorizes a supported resolution.
- [ ] **Gate:** legal and illegal cuts, property at road edge, named buildings, preserved external references, one-step Undo/Redo, round-trip save, and no unresolved ownership.

### E3 — Merge adjacent compatible properties (merged PR #62)

**Completed contract:** [E3 property merging design](E3_PROPERTY_MERGE_DESIGN.md). The reviewed primary/secondary identity policy, metadata retirement consent, exact adjacency geometry and schema-9 lineage were implemented in merged [PR #62](https://github.com/xbwtyz/Mappo/pull/62).

- [ ] Require verified geometric adjacency, compatible block/frontage and a valid combined parcel. No cross-block or road-crossing merge without separately authorized design.
- [ ] Show the identity/metadata conflict policy before Apply. Prefer a clear resulting identity and an auditable merge ledger; never silently discard either customized property identity.
- [ ] Validate dependent plots, buildings and protected relationships; keep an invalid or contested merge draft editable.
- [ ] **Gate:** merge generated lots, merge customized lots with explicit decisions, reject nonadjacent/ambiguous cases and prove exact Undo/Redo.

### E4 — Plot division and dependency reconciliation (merged PR #64)

**Detailed proposed contract:** [E4 plot-count and dependency design](E4_PLOT_COUNT_DESIGN.md). The approved identity, metadata retirement consent, lineage and building membership rules were implemented in merged [PR #64](https://github.com/xbwtyz/Mappo/pull/64).

- [ ] Extend the **existing** plot-divider tooling to support deliberate plot-count changes (split/merge plots) where schema and geometry allow; avoid a second competing plot editor.
- [ ] Reconcile plot IDs, property ownership, building plot memberships, entrance/frontage paths and necessary connected records using only verified geometry and recorded lineage.
- [ ] Display grouped consequences with Details available; focus and recover from affected authored buildings without forcing global redevelopment.
- [ ] **Gate:** multiple buildings/plots, old custom metadata, ambiguous ownership, cancelled authorizations, and no orphaned reference after Apply/Undo/Redo/save.

### E5 — Integrated stabilization and milestone acceptance (merged PR #66)

**Detailed acceptance plan:** [E5 integrated acceptance](E5_INTEGRATED_ACCEPTANCE_PLAN.md). E1–E4 are merged, including E4 in [PR #64](https://github.com/xbwtyz/Mappo/pull/64). E5 was **integration/QA**, not new property editing functionality, and was accepted in merged [PR #66](https://github.com/xbwtyz/Mappo/pull/66). The checklist below documents the original acceptance proposal, including historical phone coverage; current routine acceptance targets desktop browsers. See the [E5 acceptance report](E5_ACCEPTANCE_REPORT.md).

- [ ] End-to-end browser cases: **road edit → inspect adapted neighborhood → create/split/merge parcel → adjust plot division → Apply/Undo/Redo → portable save/reopen**, on Chromium and Firefox at desktop and phone sizes.
- [ ] Test all four morphologies, developed Small/Large fixtures, legacy schema-9 datasets, access/landscape/civic protections, stale drafts, and repeated edits.
- [ ] Compare edit latency and input/frame gaps to the current road-editor baseline under a controlled runner; keep ongoing large-city responsiveness separately in [issue #44](https://github.com/xbwtyz/Mappo/issues/44).
- [ ] Run full Node and browser regression, verify root HTML is byte-identical to the versioned offline distribution, document coverage and limitations.
- [ ] Merge only with explicit separate approval. Do not tag or publish a 0.2 release from E alone.

## Design authority and completed outcome

E1–E5 were completed in merged PRs #58, #60, #62, #64 and #66, respectively. [E5 acceptance](E5_ACCEPTANCE_REPORT.md) documents integrated verification. The completed functionality is included in published v0.2.0; its original design decisions remain preserved.

## Explicitly deferred

Complex free-form building vertex/wing editing belongs to [0.2F](MILESTONE_0_2F_BUILDING_DESIGN.md). Civic-place/landmark editors remain deferred beyond v0.2.0; 0.2G became the desktop workspace rebuild, while 0.2H release hardening is complete. 3D is later than a stable 2D designer.
