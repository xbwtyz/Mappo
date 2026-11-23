# Mappo 0.2A — Preservation contract and QA matrix

> Preservation contract for the owner-authorized 0.2A implementation, started 2026-11-18.
> [0.2A plan](../history/0.2/roads/milestone-0-2a-plan.md) · [0.2 roadmap](../history/0.2/README.md)

## 1. Immutable accepted state

For all of 0.2A, `project.city` and its canonical save/recovery representation stay unchanged by road analysis, impact reports, visual selection, drag gestures and preview reset/cancel.

```text
ACCEPTED CITY (read-only)                       DRAFT (temporary, read-only to save)
nodes + roads + faces                           proposed junction/road geometry
  |                                                   |
  v                                                   v
indexed road graph                             face recalculation / correspondence
  |                                                   |
  +----------------- DEPENDENCY ANALYSIS -------------+
                             |
                             v
                   SAFE / NEEDS REVIEW / INVALID
                             |
                             v
                     UI PREVIEW + REPORT
                    (NO APPLY IN 0.2A)
```

Future 0.2B acceptance, once separately approved: clone → graph & face validation → preserve IDs/resolve all dependencies → schema/project validation → portable encode/decode round-trip → **one atomic Apply** → one transaction in Undo. In 0.2A, **stop before Apply**.

## 2. Preservation hierarchy

1. Preserve original city ID and accepted road/junction IDs when the record continues logically.
2. Keep block IDs on unambiguous face matches; retain ring/sector/usage and other metadata.
3. Preserve all property/plot/building IDs, custom names, uses and ownership. Do not relocate or regenerate automatically.
4. Preserve existing district references, terrain/water records, bridges, plaza and forts. Report unsupported dependencies.
5. When preservation is impossible or mapping is ambiguous, provide an issue report, not an automatic replacement.
6. **Protected edges**: boundary, plaza, bridge, bank, water/terrain boundary, foothill and mountain pass connections must not be silently modified by ordinary junction movement.
7. Keep transient road editing objects out of schema 9 saves and recovery.

## 3. Proposed impact-status semantics

| Status | Condition | Phase 0.2A behavior | Later 0.2B behavior |
| --- | --- | --- | --- |
| **Safe** | Graph and faces valid; every dependent invariant can remain valid and its identities preserved | Green preview; report preserved IDs; still no Apply | Eligible for atomic Apply if the approved 0.2B operation supports it |
| **Needs review** | Topology can be well-formed, but a property, frontage, plot, building, district, fortification or matching rule would need an explicit change | Amber warning; list affected IDs and reasons; no Apply | Remains blocked until controlled local reconciliation is separately designed |
| **Invalid** | Broken topology or forbidden protected-edge operation | Red preview; clear correction guidance; no Apply | No acceptance; change geometry or operation |

Do not use a merely parseable road graph as proof of a **Safe** city. The dependent saved-city validators remain authoritative.

## 4. Integrity matrix to test

| Category | Examples | Pass criteria |
| --- | --- | --- |
| Baseline parity | Organic/radial/linear/planned seeds; varying sizes/outlines | Same original generated city/graph/face output after extraction |
| Road graph | Dangling node, duplicate edge, disconnected component, crossing road, degenerate segment | Consistent deterministic issues and no mutation |
| Identity | Unchanged faces, shifted but equivalent face, split/merge, ambiguous overlap | Correct match or explicit ambiguity; no spurious re-ID |
| City boundary/plaza | Road moved past outline, plaza center displaced, protected plaza perimeter | Invalid or protected diagnostic; original preserved |
| Water | River/lake/coast banks, bridge/water-facing edge | Protected relation reported; no damaged water records |
| Terrain | Mountain ridge, pass, foothill boundary | Special geometry protected and reported |
| Land | Property outside block; frontage changes; road setback/overlap | Needs review or invalid, with exact property/road IDs |
| Buildings | Building edge conflicts, missing plot, altered frontage access | ID-specific conflict; no removal/reassignment |
| District and defenses | District reference invalidation, wall/gate/tower dependencies | Affected records listed, not silently replaced |
| Persistence | Existing format-1/schema-9 saves; old project fixtures | No preview persistence; opening/closing does not alter saved city |
| Input safety | NaN, extreme coordinates, over-complex maps | Bounded validation and actionable rejection |
| UI | Mouse, keyboard, touch; desktop/ultrawide/tablet/phone; Firefox + Chromium | No page errors; preview/reset/cancel and accessibility pass |

## 5. Non-goals for 0.2A

- No accepted geometry commits or actual destructive road edits.
- No automatic splits/merges or relocation of parcels/buildings.
- No renumbering of city objects caused by regeneration.
- No full 3D renderer, population simulator or unrestricted spline geometry.
- No mandatory schema 10 until a future, explicitly authorized persisted-model change.

## 6. Required evidence at each implementation checkpoint

- Node tests for pure geometry, parity, identity and report semantics.
- Compile reproducibility with a versioned `dist/` standalone HTML (and root distribution as used in 0.1).
- Browser QA in Firefox and Chromium across desktop, ultrawide, tablet and phone.
- Impact report examples for unchanged/safe, needs-review, invalid and special protected connections.
- Explicit review of any modified JSON schema, migration or history behavior.
- PR gate: automated tests complete and **owner separately approves merging**.

Implementation is authorized for 0.2A; merging each checkpoint still requires separate owner approval.
