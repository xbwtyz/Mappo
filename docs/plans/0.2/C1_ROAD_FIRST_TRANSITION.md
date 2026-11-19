# Transition from the experimental C1 segment editor to road-first 0.2C

**Relevant PR:** [#34 — C1 bounded segment editor](https://github.com/xbwtyz/Mappo/pull/34)  
**Status:** Preserve as draft/experimental for source review. Do not merge unchanged.

## Why the contract changed

The experimental C1 gave useful error diagnostics but forced the user to find rare moves that happened to fit all existing parcels. Tiny 0.001-unit success cases and even later visible 1-unit positive tests proved validator correctness, **not free road manipulation**. A Find a valid move button reduced guessing but inverted the intended experience: the editor chose where a road may go.

The product owner clarified the hierarchy: users deliberately place roads; Mappo adapts generated blocks/parcels/buildings intelligently; users subsequently fine-tune properties and boundaries. New C1 therefore focuses on direct road **intent** and inspectable previews, while C2 and C5 progressively make road-first movements apply-able in developed neighborhoods.

## Keep, revise, retire

| Prior implementation | Transition |
| --- | --- |
| A1–A3 graph/face/impact APIs | Keep as authoritative diagnostics and building blocks, not blanket permission to reject a draft |
| B4/B5 atomic acceptance, coupled Undo/Redo, schema-9 validation | Keep unchanged as safety baseline; expand transaction types after complete reconciliation |
| PR #34 two-endpoint candidate, stable IDs, full-project validation | Reuse reviewed graph/delta code; separate draft intent from final accepted neighborhood candidate |
| PR #34 road selection, offset controls, teal overlay | Reuse and extend with direct dragging, intentional road placement and preview that persists despite property conflicts |
| PR #34 frontage warp | Retain as one local reflow strategy, not the only supported path |
| PR #34 Find a valid move | Optional education/debugging; not the primary editor |
| PR #34 assumption that untouched buildings never move | Replace with provenance-based policy for generated/unmodified buildings at C5; manual/unknown records protected |
| Property-block changes requiring all old parcels to remain geometrically untouched | Replace with local reflow/regeneration as C2 proves its ownership and identity contract |

## First redefined C1 sequence

1. Define typed road-intent draft and separate status fields: `draftable`, `topologyResolved`, `neighborhoodResolved`, `applyReady`.
2. Establish road selection/dragging with mouse/touch/keyboard, pan behavior, cancellation and stale revision invalidation; no generated-parcel veto on the *preview*.
3. Render original/proposed entire connected road neighborhood and meaningful conflict groups; keep street under pointer even if a block needs C2 adaptation.
4. Carry forward independent preservation checks for the existing eligible Apply subset. Never falsely enable Apply on an unresolved candidate.
5. Test desired placement preview in populated cities over **visible** distances and re-preview after repeated edits. Assert no Save/recovery/history writes before Apply.
6. Build a versioned standalone HTML and run Firefox/Chromium desktop, ultrawide, tablet, phone test matrix. Do not call C1 a fully usable final road editor; its checkpoint is user-intent preview fidelity.

## C2 entry conditions

C1 detached road intent usable on ordinary roads; protected-feature concerns classified; work bounds and Undo/recovery isolation proven; clear mapping from intent to candidate graph and typed blockers. C2 adds actual parcel/block adaptation and positive Apply transactions, not another method of locating minor permissible edits.
