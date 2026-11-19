# 0.2B / B4 — Atomic Road Apply & Undo/Redo

B4 is the first version able to commit a supported road junction move. The UI's enabled state is advisory only: every Apply recomputes the B2 reconciliation from the **current** accepted project and junction intent.

## Commit gate
1. Reject invalid/pending/stale preview and malformed intent.
2. Recompute B1/A3/B2 from the accepted snapshot; reject any unresolved or incomplete validation.
3. Verify field-level preservation: no identities, unknown properties, buildings, districts, defenses, water/terrain or other records change. Only node coordinates, block area/vertices, property geometry, plot boundary and open-space derived area are allowed.
4. Revalidate entire candidate with the current schema-9 project validator, A1 graph and A2 face identities.
5. Verify schema-9 format-1 portable encode/decode equivalence.
6. Record exactly one complete before/after history transaction, replace accepted project once, mark file changed once and exit road preview.

## Undo/Redo
RoadProjectHistoryB4 stores at most 20 complete snapshot pairs, guarded by equality of the current accepted project. Undo/Redo each validates the desired state and portable round-trip before restoring, and each counts as one accepted file revision. History stays out of saves; loading or regenerating clears road history. Other editor changes invalidate stale history by project equality.

## Restrictions
No arbitrary property splits/merges, building repositioning, invented parcel repair, protected infrastructure editing or schema upgrade. All unsupported proposals remain disabled with reasons. B5 handles expanded tools.

Tests: focused invalid/stale/preservation/atomic-history cases and existing full Node, standalone and cross-browser regression suites. One final commit, separate merge approval.
