# Milestone 3G-C — Geometry Validation and Safe Application

**Versioned checkpoint:** `0.1-dev.3gc` · **Feature branch:** `feature/building-validation-3gc`  
**Base:** merged 3G-B PR #7, main commit `c6407d975500dc1bfc587fb055f026796ff4fcee`.  
**Status:** Pending owner review; do not merge without explicit approval.

## C1 — Precise geometry checks

`src/core/building-validation.js` performs pure, side-effect-free polygon verification: finite vertices, positive area, non-self-crossing edges, containment inside the parent property including concavity, courtyard geometry, and occupied-area collision with other buildings on the same property. Boundaries touching without interior overlap are permitted, subject to the full saved-project validator.

## C2 — Connected data reconciliation

`src/editor/building-application.js` computes the transformed net area and actual occupied plot IDs using the same clipping threshold as the schema-9 project validator. It reconstructs an entrance and path to the building's **unchanged original frontage road**, avoiding passage through buildings or unrelated parcels. If no unblocked frontage path can be constructed, the edit is invalid. It never accepts the translated 3G-B access path as a real connection.

## C3 — Feedback and validity states

A fast geometry-only validation checks each drag frame; the full project and frontage check runs after gesture release, numeric change or Apply. Status is **idle**, **checking**, **valid**, or **invalid**, and the UI describes individual errors. Valid preview outlines are green; invalid ones are red; conflicting boundaries/buildings are highlighted when identifiable. Apply stays disabled except for a changed, fully verified candidate.

## C4 — Atomic acceptance

Click **Apply to City** to recompute a *fresh* candidate from accepted records and the current transform. The candidate gets all dependent fields reconciled and passes `validateStoredProject`, `createProjectDocument`, `encodeProjectDocument`, and `decodeProjectDocument` before replacing a single accepted project reference. The complete city geometry is compared for exact save/load preservation. Any failure keeps the previous accepted project unchanged. Successful Apply resets the preview, retains the selected building, and marks project files dirty for recovery. Undo of accepted footprint edits is **not** implemented in 3G-C; it is deferred to 3G-D.

## C5 — Verification and standalone distribution

`tests/building-validation.test.js` and `tests/building-application.test.js` exercise exact shape validation and pure reconciliation. `tests/building-validation-workflow.test.js` checks rejected and accepted UI transactions, save/load compatibility and rollback conditions. The existing Chromium/Firefox browser matrix, across desktop, ultrawide, tablet and phone, checks invalid preview feedback, disabled Apply and screenshots. The standalone preview files `index.html` and `dist/mappo-0.1-dev.3gc.html` are generated from modular source and verified byte-for-byte in CI.

## Non-goals and future work

- No data schema changes: project schema stays **9**, workspace schema **1**.
- No cross-property building transfers; property/building IDs, plot/property ownership and immutable road network remain preserved.
- No automatic acceptance of invalid overlaps, out-of-bounds geometry, courtyard problems or broken road access.
- No editor Undo/Redo for committed building changes yet (**3G-D**).
- Historical standalone HTML builds and Pages workflow are unchanged.

[Standalone 3G-C preview](../../../dist/mappo-0.1-dev.3gc.html) · [Roadmap](../../ROADMAP.md) · [3G-B checkpoint](MILESTONE_3GB_QA.md).
