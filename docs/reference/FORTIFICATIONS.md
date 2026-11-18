# Fortification modules and extension contracts

Milestone 3D adds one optional exterior wall ring with connected street gates and round towers. Source modules remain independent of rendering and project-file UI. Water introduced in 3E adds independently saved water openings to the ring; coastal mode in 3E.1 removes all submerged perimeter sections. Gates and towers remain clear of water. Native UI generation enables defenses by default; the core city factory keeps this optional through `options.fortifications.enabled`.

## Responsibilities

| Module | Responsibility |
| --- | --- |
| `core/fortification-geometry.js` | Closed-ring measurements, wrapped arc positions, solid wall segments, simple-ring checks and exterior distance contour |
| `core/gate-geometry.js` | Shared gatepost geometry and approach/wall clearance |
| `generators/fortifications.js` | Normalize settings, select registered builder, assemble and validate defenses |
| `generators/gates.js` | Find actual perimeter junctions and select clear, spread gate approaches |
| `generators/towers.js` | Corner and interval placement with gate/corridor spacing |
| `core/fortification-model.js` | Model validation, enable flag and camera bounds |
| `editor/fortifications.js` | Independent snapshots, apply/undo and saved-history validation |
| `renderer/fortifications.js` | Approach strokes, real wall gaps, gateposts and towers |
| `ui/fortifications.js` | Controls, feedback and editor integration |

## Geometry pipeline

The outer builder creates a bounded signed-distance contour around the accepted city boundary, extracts its exterior loop and simplifies it. Exact containment, segment clearance and simplicity checks follow approximation. Deep narrow inlets can close across their mouths while the original city stays fixed. There is no fallback that silently moves streets or puts walls across blocks.

Gates use existing perimeter street junctions. Candidate directions favor continuing incoming streets, with outward boundary normals available where safe. A candidate must reach the wall, pass its actual opening and terminate outside. Gate selection spreads candidates around the perimeter and rejects crossing approaches. A requested gate count is a maximum target; the UI reports a smaller actual result when clearance limits selection.

Towers prefer corners, then fill intervals using a deterministic seed phase. Every tower must clear gateposts, roads, other towers and gate approaches. Spacing is a placement target, not a promise of exact equal intervals.

The renderer and validator share wall opening and gatepost helpers. Collision radii include tower outlines. Original nodes/roads, blocks, square, properties, plots, buildings, open spaces and districts are not regenerated or rewritten.

## Extension workflow

1. Add a builder to `FORTIFICATION_BUILDERS` with a distinct algorithm ID. Return a new city root and new defense collections; preserve unrelated references and data.
2. Use versioned wall/gate/tower record kinds. Extend strict validation and matching rendering together before accepting a new form. Unknown incompatible kinds must produce a compatible-build error.
3. Keep saved geometry authoritative. Do not rebuild during load, migration, visibility changes or unchanged-setting enable toggles.
4. Add controls through the separate panel and editor. Preserve independent undo and unknown compatible saved control/extension fields.
5. Add focused clearance, connectivity, deterministic generation, save round-trip and old-file migration checks. Increment the project schema for incompatible model changes.

Possible later additions include alternate towers/gatehouses, manually chosen gates, inner rings and terrain-aware walls. They require deliberate new model and validation contracts. Existing collection names alone do not imply support for multiple active rings.

Explicit rebuilds replace defense records; metadata transfer between old and new generated records requires a defined mapping rather than an assumption based on reused IDs. Toggle and undo retain exact records.

See `PROJECT_FORMAT.md` for schema 4 and `QA.md` for tests and the remaining graphical Firefox checklist.
