# Mappo 0.2C — Flexible Road Editing (approved direction; design only)

**Decision:** 2026-11-18 · Official 0.2C direction approved by project owner.  
**Implementation:** Not authorized. No C1–C6 feature branch, source edits, schema migration or merge is implied.  
**Predecessor:** Merge and verify B5 separately before implementation begins.  
**Product objective:** Let users deliberately reshape an existing 2D city road network, with inspectable consequences, protected custom work and one reversible Apply per accepted operation.

## 1. What changes from the original 0.2C

Original 0.2C was manual property creation, splitting, merging and building/ownership reconciliation. That work moves to **0.2D**, rather than disappearing. New 0.2C focuses on road flexibility and the minimum general-purpose topology/parcel reconciliation required to support it. Future advanced buildings move to **0.2E**; conditional civic places to **0.2F**; release hardening to **0.2G**. All remain 0.2 milestone phases; exact scope/release date is subject to separate approvals.

0.2A provided graph, face, impact and preview APIs. 0.2B B1–B4 developed conservative ordinary-junction candidates, parcel/plot adaptation, visual previews, atomic Apply, scoped history and schema-9 round-trip. B5 adds hardening/QA and explicitly defers segment translation, edge creation/removal and classification where invariants remain unproved. **Do not confuse 'candidate geometry is valid' with 'accepted neighborhood is preservable'.**

## 2. Strict, continuing preservation contract

1. **Accepted state immutability:** All draft computation uses detached data. Cancel, invalid input, timeout, stale preview, failed save validation or user rejection writes no project/history/file revision/recovery.
2. **Stable identity and metadata:** Preserve every surviving city/node/road/face/block/property/plot/building ID, custom name, usage, ownership link and unknown extension field. No automatic global regeneration or renumbering. New IDs are deterministic and collision-free.
3. **Protected topology:** City outlines, water/shoreline/bank faces, bridges, plazas, hills/passes and fortification-sensitive edges are immutable unless a *separate, explicit* operation establishes all necessary invariants. Reject crossing/overlapping/zero-length/dangling edges, invalid embedding, broken connectivity and unresolved special ownership.
4. **Dependency-closed reconciliation:** Track affected old/new roads and faces through blocks, districts, parcels, frontage, plots, buildings, entrances, access, clearances, fortifications and protected land/water features. Recompute the changed neighborhood and validate the *entire* project before acceptance; never rely solely on a local graph check.
5. **Split/merge identity policy:** Retain an original ID only with provable one-to-one correspondence. A genuinely split/merged face has no automatic identity inheritance; require explicit ownership/identity decisions, replacement IDs and audited references. Unresolved/unknown semantics block Apply.
6. **Building preservation:** Preserve footprints, position, entrance, geometry and metadata exactly by default. No silent move, shrink, rebuild, delete or reattachment. A future explicit building-resolution action needs a visible choice, separate validation and rollback; until proven, it is a blocked preview.
7. **Authoritative Apply:** UI eligibility is informational. At Apply, recompute from current accepted project, check project identity/fingerprint/revision/intent, compare inspected and recomputed candidates, audit every permitted change, validate graph, faces, dependent entities and portable round-trip. Apply as one coupled accepted transaction with exactly one recovery revision.
8. **Undo/Redo and serialization:** Restore the entire coupled road/neighborhood state. Incompatible unrelated edits invalidate stale history; no old history can overwrite later work. Preserve format-1/schema-9 portable compatibility wherever possible; schema 10 requires explicit prior approval plus migration and legacy fixture coverage.
9. **Conservative by default:** Every ambiguous or unsupported outcome is **Needs review** or **Invalid**, with actionable IDs, reasons and safe reset. Review-required edits never become accepted solely because the user chooses a more permissive UI mode.
10. **Property-first workflow:** Existing land selection, building tools, controls and offline standalone HTML must remain usable throughout.

## 3. Six sequential development cycles

### C1 — Multi-junction transactions and bounded road-segment movement

**Deliverable:** Extend the proven B4 accepted change model to a deterministic, **bounded two-endpoint translation** of one eligible ordinary segment, including its incident network. Show ghost geometry and dependent impact before Apply. Preserve single-junction movement and all previous workflows.

**Rules:** Both endpoints must be editable, unprotected, unambiguously identified and moved as one intent. Graph remains connected and embedded without crossings/overlaps or unintended node coalescence; all affected faces still map one-to-one under this cycle. No new/deleted edges or block splits/merges yet. A candidate that requires currently unsupported parcel or building adaptation is rejected, not silently accepted. Selection and coordinate controls should explain endpoint coupling.

**Tests:** Endpoint symmetry and reversal, zero displacement/no-op, crossings and protected-road rejection, disconnected/dangling cases, seeds/morphologies/custom outline sizes, preserving IDs and opaque fields, focused/developed-city fixtures, stale two-point draft, true Apply→Undo→Redo, schema-9 reload and B4 regression.

**Gate:** Demonstrate at least one meaningful positive segment movement (not just negatives) on a developed city, together with real-browser interaction. If no supported case survives the full dependency chain, keep the capability preview-only and report the limitation instead of merging a nonfunctional editor.

### C2 — Explicit face, block and ownership reconciliation foundations

**Deliverable:** Introduce a detached, typed **change-set and identity-decision layer** for old/new roads, faces and blocks, plus references through property/plot/building and district/defense relationships. This is infrastructure to support C3, *not* unrestricted manual property editing.

**Rules:** One-to-one faces keep IDs/metadata; split/merge/created/removed faces carry proposed provisional IDs, affected reference inventories and explicit identity/ownership decision requirements. Never guess which child inherits an old ID or which merged block receives unrelated metadata. Record per-field provenance; distinguish deterministic compatible migrations from user decisions and unresolvable constraints. A preview can be richer than the presently accepted subset.

**Tests:** Synthetic face split/merge/adjacent changes; collision-free deterministic IDs under order permutations; one-to-many/many-to-one ownership ambiguity; shared frontier and roads; unknown extension fields; rollback of incomplete decisions; property/plot/building and district/defense reference closure. Pure tests must establish no mutation.

**Gate:** Complete traceable dependency graph and explicit unresolved outcomes. Merge must not silently enable split/merge Apply just because a candidate appears graph-valid.

### C3 — Insert, remove, reconnect and cautiously classify roads

**Deliverable:** Provide tools and non-destructive previews for adding an ordinary road, deleting an eligible ordinary edge, reconnecting endpoints and changing eligible ordinary road classifications. Each operation has its own acceptance rule and inverse history record.

**Rules:** Adding/removing an edge may create, split or merge faces; use C2 identity decisions and reject unresolved ownership, property, district, infrastructure or building consequences. New node/edge IDs deterministic and unique. Road classification must not strip or bypass any protected reason, bridge/bank/defense requirement, or road-reference semantics. No arbitrary rewrites of land ownership and no full-city rebuild. Subfeatures not meeting their individual proofs remain inspection-only, clearly labeled.

**Tests:** Edge duplicate/crossing/zero-length and invalid connecting cases; split/merge identity and ownership decisions; protected-edge and bridge/defense cases; deterministic replay and inverse Apply/Undo/Redo; unrelated project data byte-/semantic-equivalent; chained edits and stale selection; save/load and cross-browser gestures.

**Gate:** At least one verifiably accepted example *per operation actually shipped*. Publish an explicit supported-operation matrix. Unsupported classes do not block supported ones but must not look editable.

### C4 — Road path reshaping with control points

**Deliverable:** Editable bends and polyline paths with point addition/removal, segment handles, precision nudges and non-destructive path previews. Keep the internal planar graph coherent.

**Rules:** Start with **piecewise straight segments** and canonicalized connected junctions. Visual smoothing may be used for display only if it never disagrees with collision/face geometry. Do not claim unrestricted spline/curve support within 0.2 unless a separate geometry and persistence contract proves planar topology and deterministic encoding. Protect banks, bridges, passes, plaza/outlines and building access as above.

**Tests:** Collinear simplification, sharp bends, self-intersection and crossing, coincident control points, same topology under equivalent vertex order, water/terrain proximity, high zoom/touch accuracy, shape-save round-trip, Undo/Redo, large outlines and rendering/geometry agreement.

**Gate:** A demonstrably useful bounded reshape tool with true full-project validation, and no hidden curve semantics that serialized schema 9 cannot express. Any persistent control-point model change is schema-reviewed before code work.

### C5 — Adaptive neighborhoods and explicit building-conflict choices

**Deliverable:** Extend local, provenance-rich adaptation for supported property boundaries, frontages, plots, access and setbacks after changed roads. Provide a clear per-object conflict-resolution UI: preserve automatically when proven, otherwise block and explain, or offer *separately validated* user-authorized transformations.

**Rules:** Never silently reposition, delete, scale, rebuild or orphan buildings. Explicit choices are previews, not blanket permission; a proposed relocation/removal is implemented only if ownership, placement, entrances, clearances, districts and reference rewrites have a fully tested decision path. Preserve unrelated properties and all custom fields. Editing one neighborhood cannot invalidate another.

**Tests:** Multiple developed neighboring blocks, disjoint lots, unusual plot shapes, frontage reflow, building-to-street access, setbacks, shared boundaries, custom/named/owned records, cross-feature dependencies, opt-in versus cancel, approved change provenance, rejection at final commit, inverse history and format-1/schema-9 compatibility.

**Gate:** Positive developed-city transformations and explicit negative conflicts tested. Any complex building operation that cannot be proven remains blocked and is scheduled separately; a destructive fallback is not acceptable.

### C6 — Unified road editor, integration, performance and release handoff

**Deliverable:** Cohesive road-edit workspace with clear tools, selection, before/after geometry, grouped impact reports, affected IDs, actionable blockers, explicit confirmation for consequential changes and accessible history. Consolidate and document accepted operation availability.

**Rules:** Every UI action routes through the same authoritative Apply and preservation contract. Keyboard/touch/desktop controls cannot bypass guards. Preview remains transient, restoring camera/selection on cancellation. Existing property-first inspectors, saved project loading, file recovery and legacy edits remain intact.

**Tests:** Full Node suite; cross-mode/cross-history interactions; old 0.1/0.2A and schema-9 fixtures; determinism and performance worst-case cities; offline build parity; Chromium and Firefox desktop (1440×900), ultrawide (5120×1440), tablet (768×1024), phone (390×844); keyboard/pointer/touch; accessibility and manual physical-device checklist.

**Gate:** Green complete CI, reproducible versioned HTML, clear limitation/release notes, and separately approved C6 merge. The 0.2C milestone is complete only when its stated supported operations have passed the actual positive acceptance stories.

## 4. Development protocol and dependency gates

- Each C-cycle receives **separate scope approval** and starts from the latest **explicitly merged** `main`; resolve B5 approval/merge first.
- Develop a focused cycle on its own branch; test and fix within the pass, preferably **one final implementation commit** with complete versioned offline HTML and one PR. Avoid needless micro-commits.
- Require focused positive/negative unit/integration tests, full Node suite, generated `index.html` parity and required Chromium/Firefox QA before calling a cycle ready.
- Every completed PR is **left unmerged until owner explicitly approves**. Approval of the 0.2C direction and this plan is *not* approval to implement, merge, release, or migrate schema.
- Keep shipping older `dist/` versions, maintain property-first selection, and do not cite or advertise competing applications in builds.
- No C1 implementation until owner approves its detailed, frozen scope.

## 5. Scope exclusions and 0.2 handoff

Excluded from 0.2C unless later separately approved: free-form unbounded splines, arbitrary protected-edge destruction, automatic city regeneration, speculative owner reassignment, hidden building relocation, 3D renderer, population/economy simulation and unrelated UI overhaul.

After C6, **0.2D** performs manual property create/split/merge workflows; **0.2E** advances 2D building design; **0.2F** handles civic/landmark tools conditionally; **0.2G** integrates, migrates, profiles, hardens and prepares the 0.2 release. Any meaningful schema-10 design needs its own approved migration plan. The final 0.2 release date is not assumed.

## 6. Official plan decision

**Approved now:** Flexible Road Editing as 0.2C direction, six-cycle design refinement and revised downstream phase order.  
**Not approved now:** Feature implementation, new schema, merging planning or implementation PRs, or automatically merging B5.
