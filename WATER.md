# Water and bridge architecture

Milestone 3E implements the agreed river-first foundation: generated courses and bridge suggestions, editable drafts, land-aware generation and actual connected bridge streets. Lakes and coasts can extend the model later; they are not accepted record kinds in this release. Building inspection remains planned for 3F.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `core/water-geometry.js` | River frame, ribbons, interpolation, line/polygon intervals and bridge spans |
| `generators/water.js` | Seeded river proposals and materializing accepted bank polygons |
| `core/water-model.js` | Supported record contracts, shoreline agreement, bridge spans, face classification and traversable connectivity |
| `editor/water.js` | Independent definition drafts, point/bridge selection, gestures and 20-step undo |
| `ui/water.js` | Water controls, tool selection, feedback and pending inputs |
| `renderer/water.js` | Water/bank fills, bridge decks and interactive preview handles |
| `core/water-fortifications.js` | Saved river openings through walls and dry gate placement |
| `generators/layout.js` | Land-clipped streets, bank edges, bridge approaches and planar face extraction |

## Generation and editing

Automatic generation proposes a single river along the longest city-bound axis, offset from the square, using an independent water seed. Its source and mouth extend beyond the city. Bridge proposals sample suitable inside-city crossings and spread them along the course. The draft can be moved before any city geometry changes.

The ribbon width is measured in the frame's lateral direction. Course points progress source-to-mouth, with bounded lateral slopes; arbitrary loops and reversals are deliberately rejected. Bridges use a normalized longitudinal coordinate, snapping to the piecewise-linear course and orienting perpendicular to its local segment. Moving river points therefore moves and reorients associated crossings coherently. Editing can temporarily break these constraints; generation explains the problem and preserves the last valid city.

Applying a definition includes bank edges and bridge lines in the existing planar street arrangement. Ordinary streets are clipped out of the corridor. Waterfront streets lie on the outside of the bank reserve. Faces inside the corridor are water faces, excluded from properties and neighborhoods. The square, dry blocks and wet faces still partition the original outline exactly. Bridge approaches become straight primary streets, split at every actual junction. Virtual outer-boundary edges over water close the arrangement but are never treated as traversable streets.

Water definitions and histories are independent of outline, district and defense editors. City regeneration resets district and defense history against their new geometry. Water undo instead restores a draft; applying it is explicit. Pointer capture, active drags and cancelled gesture buffers are transient. Imported projects restore accepted geometry directly and never auto-apply unfinished water drafts.

## Extension rules

- Add explicit versioned feature and crossing kinds, geometry helpers, validation and matching rendering together. Current limits intentionally accept only one river and eight bridges.
- Keep accepted geometry authoritative and preserve compatible JSON fields. Changing a water draft must not mutate city records.
- Extend the arrangement's land/wet face classification for lakes, coastlines, islands or multiple rivers; do not cover unwanted buildings with a water-colored overlay.
- Preserve real shared junctions at bridge ends and validate traversable connectivity independently of virtual arrangement edges.
- Keep shore setbacks and rendered road/bridge widths consistent. New terrain-aware crossings, variable widths and bridge styles need corresponding clearance checks.
- Extend the fortification adapter for each new feature kind so walls, towers and street gates respect its geometry.
- Use explicit migrations and frozen standalone-save fixtures for incompatible model changes. Schema 5 preserves older cities as dry land.

See `PROJECT_FORMAT.md` for the exact persistence contract and `QA.md` for automated coverage and the native Firefox checklist.
