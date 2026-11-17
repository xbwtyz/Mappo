# Water and bridge architecture

Milestone 3E implements generated/editable rivers and connected bridges. The 3E.1 expansion adds generated/editable coastlines, an explicit ocean side and connected coastal land. One river or one coast is supported per city; lakes, joined river mouths and multiple features remain extensions. Building inspection remains planned for 3F.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `core/water-geometry.js` | Shared course frame, river/coast shape adapters, interpolation, line/polygon intervals and bridge spans |
| `generators/water.js` | Seeded river proposals and materializing accepted water polygons through shape adapters |
| `generators/coast.js` | Independent seeded shorelines, requested ocean direction and connected-land proposals |
| `core/water-regions.js` | Shoreline-only planar arrangement and dry-region counting before streets exist |
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

- Add explicit versioned feature and crossing kinds, geometry helpers, validation and matching rendering together. Current limits accept one river with up to eight bridges or one coast without bridges.
- Keep accepted geometry authoritative and preserve compatible JSON fields. Changing a water draft must not mutate city records.
- Extend the arrangement's land/wet face classification for lakes, coastlines, islands or multiple rivers; do not cover unwanted buildings with a water-colored overlay.
- Preserve real shared junctions at bridge ends and validate traversable connectivity independently of virtual arrangement edges.
- Keep shore setbacks and rendered road/bridge widths consistent. New terrain-aware crossings, variable widths and bridge styles need corresponding clearance checks.
- Extend the fortification adapter for each new feature kind so walls, towers and street gates respect its geometry.
- Use explicit migrations and frozen standalone-save fixtures for incompatible model changes. Schema 5 preserves older cities as dry land; schema 6 preserves existing river data unchanged.

See `PROJECT_FORMAT.md` for the exact persistence contract and `QA.md` for automated coverage and the native Firefox checklist.

## Coast adapter

`WATER_GEOMETRY` selects a shape implementation by supported kind. Rivers retain their exact ribbon calculation; coast polygons close from the ordered shoreline toward the selected ocean side using a stored sea depth. Layout clipping, water-face extraction, shoreline roads and the fortification adapter use `waterFeaturePolygon` rather than assuming a two-bank river. New kinds require matching strict model/draft validation and rendering.

The coastline generator keeps the square on land and rejects proposals producing disconnected dry regions. Edited coasts run the same preflight check. The full city still validates real street connectivity independently of virtual boundary edges. Ocean direction applies to new proposals; swapping land/water edits the current draft and can intentionally make it invalid until the shore or square is moved.

The shared editor uses the existing `river` mode internally for course handles, preserving workspace-schema-1 compatibility. Bridge tools and river-width changes are disabled for coastal drafts. Explicit water generation replaces the previous draft with one feature; undo can restore it. No river/coast joining is inferred.
