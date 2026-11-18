# Mappo 0.1 Dev 4d — Inspector facts and actionable validation

**Branch:** `feature/dev4-inspector-feedback` | **Status:** Implemented for QA; not merged.

## Scope
- [x] Accepted-data property summary: site area, frontage length, plot count, building count, estimated unbuilt area.
- [x] Estimated unbuilt area = max(0, accepted property area − accepted owned-building net footprint area). This is **not a guarantee of buildable area**. Unavailable/incomplete links show 'Not recorded'.
- [x] Read-only fresh Inspector derivations support edited or renamed properties and zero/multiple buildings.
- [x] Human-actionable messages preserve existing issue `code`, `targetId`, original explanation and identify known road, property, building, plot or block IDs.
- [x] Validating preview panels plus a nonblocking, map-adjacent, accessible summary; stale feedback disappears after correction, reset or cancel.
- [x] Atomic Apply and original validators remain authoritative. No accepted geometry changes or schema migrations.
- [x] Node unit and browser-matrix regression cases for new readouts and invalid placements.
- [ ] Green CI on exact final PR SHA: Node tests, distribution byte parity, Chromium and Firefox desktop/ultrawide/tablet/phone QA.
- [ ] Separate owner approval for merge.

**Compatibility:** Project schema 9, workspace schema 1 and save-container format 1 unchanged. No new persisted fields. Survey units are internal Mappo units, not physical meters.
