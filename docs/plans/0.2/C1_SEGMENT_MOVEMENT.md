# 0.2C / C1 — Bounded road-segment movement

**Status:** Integration candidate; await full CI and owner merge authorization.

## User story
Choose an ordinary road in Road Inspection, enter X/Y translation, click **Preview segment move** to see both endpoints and connected road outlines move together, and click **Apply segment** only after complete candidate validation. Existing one-junction editing remains available.

## Preservation contract
- Both endpoints must be eligible and unprotected; bounded 6-unit translation.
- Recompute graph, one-to-one faces, affected blocks, supported parcel frontage/plots and open-space area; full accepted project must validate.
- Protected roads, invalid crossings, face split/merge, ambiguous ownership, unsupported parcels/building access or incomplete persistence checks block Apply.
- Both original and candidate are immutable during preview; after revision/fingerprint/selection recheck, rebuild independent candidate and audit exact allowed fields before one coupled Apply/Undo/Redo transaction.
- Keep buildings, road IDs, custom metadata, ownership, water/terrain/defense and untouched neighborhoods unchanged. Schema 9 remains the default.
- No arbitrary road add/delete/classify, splines or silent building relocation.

## Release gate
Node positive/negative/stale, UI Apply/Cancel/Undo/Redo, at least one validated *developed-city* segment translation, Chromium/Firefox browser matrix across desktop, ultrawide, tablet and phone, root/standalone exact build parity, one owner-approved merge. Ship versioned `dist/mappo-0.2-dev.c1.html`. Physical-device QA remains manual.

**C2** identity/ownership restructuring follows after C1 signoff, not before.

## Usability correction — developed city movement
- An unchanged parcel may remain in a newly shaped block **if** the full project validator proves containment and setbacks. C1 no longer insists it must be warped merely because its block area changed.
- Every property whose `frontageRoadId` touches either translated junction still receives conservative frontage/plot adaptation.
- Add a 1-unit visible-movement acceptance survey across multiple generated settlement morphologies; require more than one developed-city positive. Record top rejection reasons for investigation.
- Do not claim full real-world usability from `0.001`-unit positive tests. Those tests remain valuable only for basic engine precision/determinism.

## Usability correction — move discovery
- **Find a valid move** in Road Inspection performs a bounded, cancellable search among up to 48 ordinary unprotected segments. It tests full 1-unit and 0.5-unit offsets through the same complete candidate validation used by manual Apply.
- A successful search selects/centers the road, fills the offset inputs and overlays the validated candidate. It **does not Apply anything**. The user must explicitly approve the normal atomic Apply.
- Search progress and failures are announced in the status field. Cancelling, resetting, changing selection, or leaving the editor discards the search and its transient result without touching project, file revision or history.
