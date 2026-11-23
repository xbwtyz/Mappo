# Mappo 0.2B / B2 — Conservative property and plot reconciliation

B2 uses B1's A1/A2/A3-reviewed detached candidate and the existing 3I quadrilateral/plot-division helpers. All results remain temporary; **Apply is always false** and no accepted city or history is updated.

## Supported transformation
- Ordinary unprotected junction move with unambiguous existing face identities
- At most 256 frontage properties and at most 6 world units of endpoint displacement
- Existing four-corner, convex property with a valid road-anchored frontage frame
- Retain property IDs, usage, ownership, plot associations and all custom fields
- Re-orient the two frontage corners to the changed road, keeping original road-local setback and relative positions; **rear property corners remain fixed**
- Rebuild ordered convex plot strips using stored divider fractions; retain plot IDs, properties and parent associations
- Update only property boundary/frontage/frame/local/area, changed plot boundaries, and affected block open-space area
- **Never move, resize, remove or relink buildings; do not edit entrances, access paths, footprints or plotIds**

## Rejections
Any unsupported geometry, changed building access/clearance, unknown dependency semantics, ambiguous identity, outdated ownership, excessive displacement, stale A3 unresolved issue, overlapping lot or failure of the full schema-9 project validator makes B2 report **Needs review** with no candidate. It never guesses a repair. Successful local candidates remain `candidate-only` with `applyReady:false`; B4 owns serialization and acceptance.

## QA and delivery
Focused tests cover immutable no-op, frontage warp, plot divider stability, detached frames, unsupported polygons, deterministic results, unchanged buildings, seeded morphology fixtures and full-project validation on any successful result. GitHub CI must also pass all Node, Chromium/Firefox and root/versioned HTML parity gates.

Branch: `feature/mappo-0-2b-b2-parcel-reconciliation`. One commit and one PR; do not merge until separately approved.
