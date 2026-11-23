# Schema 10 S10-C courtyard access

**Review candidate** · Mappo `0.2.15-dev` · based on merged S10-B `08b33925cd8e`. See [#122](https://github.com/xbwtyz/Mappo/issues/122) for the broader courtyard topology work.

## Data contract and scope

- A host has one solid exterior with direct courtyard voids. An occupant is a separate, single-footprint building on the same property. Several occupants can share one portal. Compound membership stays independent of courtyard access.
- Geometry version 2 marks a host with one or more authored portals. Each portal uses a stable host-scoped ID and two finite opening intervals on named region edges. The openings are parallel and equally wide, with a clear straight strip through a single wall and a 0.35-unit landing on each side. Occupied area and roof geometry remain authoritative.
- A saved occupant stores its ordinary path from its door, through the portal’s two midpoints, to the property’s verified primary frontage edge and adjacent street. Search prefers the valid existing route and uses bounded deterministic bends when needed. The project validator independently checks every accepted segment, landings, ownership and references.
- The first pass supports 16 portals and 32 occupants per host, 0.5–8 survey-unit opening widths, 32 saved route points, 192 search waypoints per phase and 400,000 work units per route search. Ambiguous or unsupported cases produce an actionable blocker.
- Portal changes and dependent route updates commit together. Single-building and compound transforms move opening anchors with the host when appropriate and recheck the full city. Property and road changes that invalidate a route require a valid candidate or are rejected. Removing a used portal requires routing its occupants through a valid replacement in the same transaction.
- Ordinary Schema 10 and supported historic saves still open. S10-B rejects the version 2 host before replacing an active project. Geometry metadata collisions are rejected without discarding the original key. Container and workspace versions remain 1. Existing feature-bearing documents require opening in S10-C or a later compatible build.
- S10-D component authoring, S10-E footprint unions, broader nesting depth and cross-property passage rights remain future work.

## Acceptance checkpoints

| Gate | Verification |
|---|---|
| P0 | Stable IDs, original S10-B reader rejection, metadata-collision handling and bounded search |
| P1 | Full portal strip validation, deterministic paths and saved-route validation |
| P2 | Independent shared-portal occupants, canonical collisions and atomic dependent edits |
| P3 | Existing desktop placement inspector, draft-only route drawing, keyboard Apply, Cancel and stale-city checks |
| P4 | Portable round trip, browser recovery and one-step Undo/Redo |
| P5 | Targeted Node tests, offline Firefox and Chromium acceptance, deterministic root/dist parity and full CI on the review candidate |

Tests are in `tests/courtyard-access.test.js` and `scripts/courtyard-access-browser-qa.mjs`. The S10-B standalone remains archived at `dist/mappo-0.2.14-dev.html`.
