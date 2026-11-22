# Group C — Building and Structural Geometry

**Status:** C02 merged; C01 in owner-approved implementation on feature branch (merge/release separately gated). **Priority:** Medium; the existing editor already supports valid concave footprints, vertex edits, connected wings and courtyard holes.

| ID | Restriction | Proposed direction |
|---|---|---|
| [C01](issues/C01.md) · [#104](https://github.com/xbwtyz/Mappo/issues/104) | No general compound/detached geometry, nested courtyard islands or boolean unions | Decide semantic model for one building vs linked structures before geometry changes |
| [C02](issues/C02.md) · [#105](https://github.com/xbwtyz/Mappo/issues/105) | One topology-changing operation per Apply | Support multiple compatible operations in a single validated preview transaction |

## Suggested sequence

**C02 first:** Smaller, independently testable improvement to a current editor workflow. Protect handle/vertex identity after each operation, and ensure Cancel discards all draft changes and a single Undo reverses the entire Apply.

**C01 0.2.10:** Owner approved property-owned **linked building records** with an optional validated compound list, group selection and coordinated transforms. Keep each member individually valid and independently accessible, and keep arbitrary unions and nested courtyard islands as separate backlog. Determine future 3D implications, selection, ownership, access and save semantics before introducing polygon boolean operations.

## Safeguards

- Preserve original building ID, use, custom name, holes, plot membership and unknown fields unless explicit permission authorizes a change.
- Never auto-move neighboring buildings to make a new footprint fit.
- Retain exact property/plot containment, road clearance and entrance/access rules.
- Reuse existing `src/core/building-footprint-f1.js`, `src/editor/building.js`, building application and history modules.

## Owner choices

Are multi-operation drafts more valuable than linked detached structures? Which examples of architecture cannot be represented today using existing connected wings and separate building records?