# Group A — Road Network and Topology Improvements

**Status:** Planning only. **0.2.1 A01 architecture approved (A/A/A/A);** Issue #79 updated and 17 additional tracking issues published; coding remains unapproved. **Priority:** Highest overall because downstream parcel and building geometry derives from accepted street topology.

## Scope and user value

Expand which ordinary road networks can be legally edited without weakening connectivity, protected infrastructure or deterministic bounded-face requirements. Version 0.2.1 addresses A01 only; the rest are future, owner-reviewed proposals.

| ID | Capability gap | Recommended treatment |
|---|---|---|
| [A01](../issues/A01.md) · [#79](https://github.com/xbwtyz/Mappo/issues/79) | Connected ordinary interior dead-end stub after road deletion; **clearance only**, generated-only local adaptation | **0.2.1 — approved architecture**; existing [Issue #79](https://github.com/xbwtyz/Mappo/issues/79) updated |
| [A02](../issues/A02.md) · [#94](https://github.com/xbwtyz/Mappo/issues/94) | Multiple disconnected networks | Product decision first: may remain forbidden by design |
| [A03](../issues/A03.md) · [#95](https://github.com/xbwtyz/Mappo/issues/95) | Coincident and collinear crossing normalization | After A01, start with one reproducible crossing class |
| [A04](../issues/A04.md) · [#96](https://github.com/xbwtyz/Mappo/issues/96) | Protected infrastructure restructuring | Separate protected-domain operation, never relax normal guards wholesale |
| [A05](../issues/A05.md) · [#97](https://github.com/xbwtyz/Mappo/issues/97) | True curves and >24 bends | Display-level smoothing option before schema-sensitive splines |
| [A06](../issues/A06.md) · [#98](https://github.com/xbwtyz/Mappo/issues/98) | Larger/ambiguous block lineage | Improve bounded local ancestry and decisions after A01/A03 |

## Architecture and dependency model

Graph validity, face extraction, local topology reflow, parcel/building reflow, and project persistence are separate validators. A topologically connected graph is **not** proof the city can be applied. Keep these layers independent and use the existing road application transaction. In particular, A01 cannot be closed merely by deleting the `dangling-junction` error.

**Approved 0.2.1 boundary:** no new dead-end frontage/access, no custom parcel rebuild, no disconnected road-network support and no protected-road editing. One implementation PR with P1–P4 internal checkpoints, pending separate implementation authorization. [Issue #79 body draft](../issues/issue-79-update-draft.md).

**Suggested next wave:** after completing 0.2.1, discuss A03 and A06 together as a coherent topology and identity-lineage program. A02/A04/A05 each need a separate user story and risk review.

## Acceptance principles for all A issues

- Graph geometry and bounded faces are deterministic for every generated morphology.
- All protected features, districts, custom properties, building access, block IDs and unknown fields remain valid or explicitly blocked.
- No hidden rebuild of unrelated neighborhoods; candidate has auditable changed/retired/preserved records.
- Current valid road moves continue to work; bad crossings/disconnected networks still reject until individually approved.
- Cancel/Apply/Undo/Redo and portable project reopen preserve exact accepted data; runtime remains offline.

## Owner discussion topics

1. **For later versions only:** Is general connected road branching a goal beyond ordinary stubs created by deletion? If pursued, define separate frontage/ownership contracts.
2. Are disconnected road islands valid cities for Mappo, or should they remain an intentional restriction?
3. Which protected feature (if any) should receive a dedicated editor first?
4. Is true curved-road persistence worth a possible project-model update compared with smooth polyline rendering?