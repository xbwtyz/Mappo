# Adjustment validation audit

Run the deterministic sweep on demand from the repository root.

```bash
node scripts/adjustment-audit.mjs > adjustment-audit.json
node scripts/adjustment-audit.mjs --case portal-frontage-reshape
node scripts/adjustment-audit.mjs --replay '{"fixture":"mixed","kind":"junction","target":"N-0154","input":{"dx":0,"dy":0.5,"parcel":"PROP-00018","choice":"reshape"}}'
```

The sweep tries each edit against a fresh draft of the same accepted starting project. It checks that preview, Apply preparation and reset leave the input project and workspace unchanged. Each result records the starting fixture and seed, target and input, whether Apply could produce a candidate, and the preview or Apply diagnostic. Road cases also capture any offered parcel choices. Each group includes a replay object. An edit may have several reasons, so group counts can exceed blocked edit counts.

The audit covers sampled building transforms, including combined courtyard translations and rotations, property corners and plot dividers, straight and flexible property splits, and ordinary and protected junctions. The cases use authored mixed and skewed-courtyard fixtures plus generated organic, radial and linear layouts. The regular Node and browser runs cover a small reviewed subset. The full sweep remains opt-in.

## Reviewed cases

| Replay | Verdict | Evidence |
| --- | --- | --- |
| `courtyard-cross-plot` | Should apply and does | A +2 Y move stays inside the courtyard, changes occupied plot references and retains the portal host and frontage. Chromium and Firefox enabled Apply and saved the new footprint offline. |
| `courtyard-wall` | Valid block | A +10 Y move places a footprint vertex inside the host's occupied wall. The browser disabled Apply and named the host. |
| `multipart-split` | Valid block with misleading wording | The two exterior regions lie entirely on opposite sides of the proposed line. Splitting would assign one building to two properties. The current message says the building crosses or touches the line ambiguously even though neither exterior ring touches it. Showing both affected parts would explain the ownership constraint. [#137](https://github.com/xbwtyz/Mappo/issues/137) |
| `irregular-split-occupied` | Valid ownership block masked by an incorrect geometry reason | The cut stays inside the five-sided parcel and meets both frontage and area minima. With the false intersection corrected in a detached diagnostic, the actual blocker identifies `BLD-00003`. |
| `irregular-split-vacant` | Incorrect block | After clearing the building in a test fixture, the same cut still reports that the divider leaves or overlaps the parcel. The same detached diagnostic produces a split that passes whole-project validation. |
| `nearby-junction` | Should apply and does | Moving `N-0153` +0.5 X keeps the courtyard route and unrelated joined building intact. |
| `portal-frontage` and `portal-frontage-reshape` | Feasible edit blocked by missing combined repair | After `N-0154` moves +0.5 Y, the existing route endpoint lies about 0.316 units off `RD-0211`. Preview offers a fixed-building reshape for `PROP-00018`. Selecting it switches the rejection to a generic parcel-fit message. The local solver can fit the parcel and both buildings, while road reflow treats the authored paths as needing separate decisions. Its topology fallback checks parcel eligibility against the old routes. [#138](https://github.com/xbwtyz/Mappo/issues/138) |

A one-off diagnostic for #138 tested an in-memory copy of the road reflow module. It kept the normal junction delta and fixed-building reshape, used the existing building access resolver for the host and occupant, and derived their occupied plots again after the reshape. The detached project passed graph, face, parcel and whole-project validation. It also round-tripped through the portable save format and through Undo/Redo. The host, occupant, portal and unrelated multipart building kept their IDs and geometry. This shows a feasible candidate for the fixture. Product decisions about how to authorize and present that repair remain open.

The irregular split diagnostic isolated the crossing test in the flexible split validator. The current determinant sign-product check treats an endpoint on a shared edge as a proper crossing when floating-point error nudges its determinant away from zero. In a temporary test-only copy, requiring each orientation determinant to clear the tolerance before treating an intersection as a proper crossing removed the false rejection. Normal ownership, plot and save validation still ran afterward. The diagnostic also reproduced on `PROP-00028` and `PROP-00030` in the same seed.

## Interpreting the sweep

- Collision, building containment, parcel overlap, setback, minimum size, property split ownership and protected infrastructure are legitimate constraints. A reviewed fixture demonstrates the constraint where practical. The sweep itself does not prove every individual message correctly identifies a violation.
- Authorship and transfer approval protect accepted records. A requested approval is legitimate where an eligible option is available and the data would otherwise change silently.
- A routing solver or parcel search that produces no candidate leaves feasibility open. A validated alternative is required to call an individual block incorrect. The frontage investigation supplies that evidence for #138.
- Generic geometry reasons and property or road diagnostics can mask a more precise issue. Compare related messages and the geometry in the replay before deciding how to change the validator or its copy.
