# Mappo 0.2E — Manual Property Restructuring (planning draft)

> **Status:** Roadmap sequencing approved after completion of 0.2D. This is a **proposed implementation scope**, not authorization to implement, merge, publish or change schema. See the [master roadmap](README.md) and [0.2F building design](MILESTONE_0_2F_BUILDING_DESIGN.md).

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
7. **Compatibility first.** Keep schema 9 unless a separate reviewed migration is strictly necessary. Keep old files readable, property-first interaction, modular JavaScript, and reproducible standalone builds.

## Proposed development sequence

### E1 — Create a property in eligible land

- [ ] Reuse accepted block geometry and existing property/plot/empty-space records to show eligible locations. Let the user draw or adjust a candidate property with ordinary map gestures and numeric refinement, without spawning a new user flow.
- [ ] Begin with geometry already supported by the validator. Reject overlap, illegal boundaries, missing street access and unprovable residual open-space tiling with specific, locatable reasons.
- [ ] Create required plot and ownership references atomically; preserve neighboring properties and accepted streets. Establish deterministic ID allocation and ensure Undo/Redo and save/reopen.
- [ ] **Gate:** generated Small and Large cities, all four morphologies, multiple adjacent lots, and legacy schema-9 saves. Creating then cancelling leaves accepted project byte-equivalent.

### E2 — Split an existing property

- [ ] Preview a division line and both resulting parcels, including access, dimensions and dependent plots/buildings.
- [ ] Carry original names/uses and IDs only where the continued identity is unambiguous. Show explicit source/successor records and require an explicit choice for contested authored identities.
- [ ] Retain buildings in the verified parcel when possible. A building spanning the split line or an unassignable plot must block Apply until the user adjusts the draft or authorizes a supported resolution.
- [ ] **Gate:** legal and illegal cuts, property at road edge, named buildings, preserved external references, one-step Undo/Redo, round-trip save, and no unresolved ownership.

### E3 — Merge adjacent compatible properties

- [ ] Require verified geometric adjacency, compatible block/frontage and a valid combined parcel. No cross-block or road-crossing merge without separately authorized design.
- [ ] Show the identity/metadata conflict policy before Apply. Prefer a clear resulting identity and an auditable merge ledger; never silently discard either customized property identity.
- [ ] Validate dependent plots, buildings and protected relationships; keep an invalid or contested merge draft editable.
- [ ] **Gate:** merge generated lots, merge customized lots with explicit decisions, reject nonadjacent/ambiguous cases and prove exact Undo/Redo.

### E4 — Plot division and dependency reconciliation

- [ ] Extend the **existing** plot-divider tooling to support deliberate plot-count changes (split/merge plots) where schema and geometry allow; avoid a second competing plot editor.
- [ ] Reconcile plot IDs, property ownership, building plot memberships, entrance/frontage paths and necessary connected records using only verified geometry and recorded lineage.
- [ ] Display grouped consequences with Details available; focus and recover from affected authored buildings without forcing global redevelopment.
- [ ] **Gate:** multiple buildings/plots, old custom metadata, ambiguous ownership, cancelled authorizations, and no orphaned reference after Apply/Undo/Redo/save.

### E5 — Integrated stabilization and milestone acceptance

- [ ] End-to-end browser cases: **road edit → inspect adapted neighborhood → create/split/merge parcel → adjust plot division → Apply/Undo/Redo → portable save/reopen**, on Chromium and Firefox at desktop and phone sizes.
- [ ] Test all four morphologies, developed Small/Large fixtures, legacy schema-9 datasets, access/landscape/civic protections, stale drafts, and repeated edits.
- [ ] Compare edit latency and input/frame gaps to the current road-editor baseline under a controlled runner; keep ongoing large-city responsiveness separately in [issue #44](https://github.com/xbwtyz/Mappo/issues/44).
- [ ] Run full Node and browser regression, verify root HTML is byte-identical to the versioned offline distribution, document coverage and limitations.
- [ ] Merge only with explicit separate approval. Do not tag or publish a 0.2 release from E alone.

## Design decisions to settle before E1 code

The implementation design must specify **how unoccupied block area is represented**, which parcel geometries can be created in schema 9, what successor IDs/metadata mean after a split or merge, and which building conflicts are safely resolvable. Resolve these in a reviewed E1 design/contract, rather than letting implementation quietly invent policy.

## Explicitly deferred

Complex free-form building vertex/wing editing belongs to [0.2F](MILESTONE_0_2F_BUILDING_DESIGN.md). Civic-place/landmark editors belong to optional 0.2G. Release migration/hardening belongs to 0.2H. 3D is later than a stable 2D designer.
