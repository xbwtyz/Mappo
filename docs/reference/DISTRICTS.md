# District architecture and extension points

The district subsystem treats a neighborhood as semantic ownership of existing blocks. It does not own or regenerate street, property or building geometry.

| Module | Responsibility |
| --- | --- |
| `src/core/district-topology.js` | Shared-edge block adjacency, connectivity, interior label locations and derived counts |
| `src/generators/districts.js` | Seeded district layout algorithms, count suggestion, generated names and palette |
| `src/core/district-model.js` | Membership propagation, invariants, rename/recolor and connected block transfer |
| `src/editor/districts.js` | Selection, district undo, snapshots and saved editor validation |
| `src/renderer/districts.js` | Colors, borders, label drawing and geometry-derived caches |
| `src/ui/districts.js` | Inspector controls and map-tap selection |
| `src/data/migrations.js` | Explicit project schema 2 → 3 migration without regeneration |

## Current invariants

An assigned district contains at least one block. Every city block belongs to exactly one district, and each district is connected through shared street edges. Properties and buildings inherit membership from their containing block. A shared junction alone is not adjacency.

District identity, presentation and geometry are separate. A record stores IDs, name, color, version, kind and extension metadata. Boundaries and inspector counts are derived from authoritative block membership; label anchors are placed inside an owned block. A concave district therefore does not put its label in a horseshoe’s open middle.

Generation uses farthest graph-distance seeds followed by multi-source graph growth. The current edge costs favor boundaries along larger streets. This is a geographic grouping algorithm, not an economy or occupation simulation.

## Adding future behavior

- **New layout algorithms:** add a provider to `DISTRICT_ALGORITHMS`. It should return a city with validated connected membership and record its algorithm/seed in `districtState`. Keep saved block IDs authoritative and call `validateDistricts` after generation.
- **Names, palettes and labels:** these live separately from ownership and can evolve without changing a saved layout. Renaming/recoloring preserves record IDs, membership and extension fields.
- **Functional themes:** add a theme/rules field or namespaced `extensions` data. Keep geographic `kind: "neighborhood"` independent from themes such as craftsmen, noble housing or warehouses. A separate future building-population policy can consume those rules when the user explicitly regenerates buildings.
- **Terrain and barriers:** enrich topology or provider-specific growth costs. Do not encode terrain assumptions into roof drawing or the inspector.
- **District statistics:** derive counts from membership and real building/property records. Cache derived values by city identity; invalidate through immutable city updates.
- **New editing operations:** return a new city object and preserve unknown record fields. Central membership propagation updates blocks, properties and buildings together. Reject operations that violate coverage/connectivity, or explicitly introduce a new supported invariant and schema migration.
- **Persistence:** increment the schema for incompatible core changes; add a pure migration, preserve unknown fields, and add frozen fixtures/tests. Extend editor snapshots if new editable district state must participate in undo.

The renderer cache is transient and never saved. Renames and transfers return a new city root, so cached boundaries and label locations are rebuilt automatically. Camera movement and layer changes reuse the derived geometry.

The canvas controller exposes a tap callback independently of district logic. It suppresses tap selection for real drags, middle-button/Space panning, cancellation and outline-editing tools. A future selection router can add building inspection without rewriting district ownership or geometry generation.

## Deliberate limits

3C moves whole blocks. It does not split blocks, remove streets, redraw parcel boundaries or move buildings. District names do not alter existing building types. Undo is scoped to district edits (20 snapshots), separate from outline editing. Fortifications and functional building-generation rules remain later milestones.
