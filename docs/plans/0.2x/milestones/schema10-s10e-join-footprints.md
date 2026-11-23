# Schema 10 S10-E · Join footprints

**Review candidate** · Mappo `0.2.17-dev` · [Issue #121](https://github.com/xbwtyz/Mappo/issues/121).

## Workflow and contract

- In **Edit components**, select the destination and choose **Join footprints**. Pick an incoming leaf component, then click on the map or enter its offset to position it in the preview. A successful preview shows the combined perimeter. Confirm removal of a named incoming part.
- Apply retains the building, destination component and exterior IDs. The incoming exterior and leaf component are retired. Compatible courtyard rings and IDs are retained. Block retirement of a component that owns children or has unsupported authored metadata.
- Split crossing edges and shared seams, keep the union boundary, and require one simple exterior. Independently verify inclusion–exclusion against the occupancy kernel. Keep existing topology and bounded work limits. Gaps, point contact, containment, ambiguous topology and new enclosed courtyards are outside the join scope.
- Recheck property containment, collisions, occupied plots, dependencies and validated frontage. Block a join that fills a courtyard, newly crosses another building’s accepted route or involves an S10-C portal host or linked courtyard occupant. Apply rebuilds the candidate from the current city and records one accepted Undo/Redo transaction.
- Continue to use project Schema 10, format 1 and workspace 1. A simple result uses the existing geometry version 1. A multipart result retains version 3. Both results remain readable in the prior S10-D standalone.
- Separate building records, independently editable attached components and general cutouts remain future work.

## Acceptance checkpoints

| Gate | Verification |
|---|---|
| P1 · Geometry | Shared and partial seams, rotated overlap, concave union, verified area, deterministic output and bounded work |
| P2 · Inspector | Destination and source selection, positioning, preview, confirmation, keyboard Apply and isolated Cancel |
| P3 · Project | Stable IDs, untouched parts and courtyard rings, parcel occupancy and street access validation |
| P4 · History and saves | Exact Undo/Redo, portable save/reopen, recovery and S10-D reader compatibility for single and multipart results |
| P5 · Desktop | Offline Chromium and Firefox, deterministic standalone parity and full exact-head CI |

Coverage is in `tests/building-footprint-union.test.js` and `scripts/building-components-browser-qa.mjs`.
