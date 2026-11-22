# Mountain terrain and road passes

Mappo 3E.6 adds independent mountain features around and inside the city. Terrain remains separate from the water model, while sharing the existing planar arrangement and polygon utilities. Building inspection was completed in 3F; the current desktop workflow is described by [G4 acceptance](../plans/0.2/G4_ACCEPTANCE_REPORT.md).

## Modules

| Module | Responsibility |
| --- | --- |
| `core/terrain-geometry.js` | Terrain limits, footprint/bank geometry, ridge safety, pass spans and dry access segments |
| `core/terrain-editing.js` | Pure guided footprint/ridge gestures and whole-range translation |
| `core/terrain-model.js` | Record contracts, exact saved geometry, reserved faces, pass spans and actual street connectivity |
| `generators/terrain.js` | Deterministic range proposals, placement modes and initial passes |
| `editor/terrain.js` | Independent selection, definition drafts, gestures, peak heights, passes and 20-step undo |
| `ui/terrain.js` | Terrain controls, pending generation settings and draft feedback |
| `renderer/terrain.js` | Reserved-ground styling, contour illustration, peaks and interactive handles |
| `core/terrain-fortifications.js` | Mountain wall openings and clear gate approaches |

## Data and geometry

A mountain is a version-1 record with a stable ID, `kind: "mountain"`, name, center, 4–32 positively wound footprint points, three ridge points with individual heights, exact `polygon` and nine-unit reserved `corridor`, generation metadata and extensions. The closing footprint point is implicit. Footprints are simple star-shaped rings around the stored center; their radii range from 14 to 3000 map units. Parallel bank edges must remain simple and retain at least six units of physical mountain clearance for rendered streets. Ridge points lie inside the footprint, progress along their endpoint axis, and retain bounded lateral bends. Heights range from 50 to 3000 elevation units.

Mountains may extend beyond the city. Only their inside-city reserved faces remove development land. Dry access segments attach an enclosed foothill loop to the surrounding street graph and split annular land into simple faces. These segments are omitted for ranges wholly outside the city. Planar street clipping includes water and mountain masks while keeping their face collections separate. Land, plaza, wet faces and mountain faces still partition the exact outer boundary.

A pass stores its own ID/version, `kind: "pass"`, owning `terrainId`, normalized ridge position `t`, fixed width 12 and extensions. Its road crosses perpendicular to the local ridge segment and spans the mountain reserve between two inside-city foothills. Approaches become primary streets, clipped against the square, water and other ranges. Actual pass roads reference `passId`; foothill roads use `foothill`. Virtual perimeter edges inside mountains use `terrainBoundary` and never render or participate in traversable connectivity. Mountains splitting land require real pass connections. Invalid crossings remain drafts and cannot replace the accepted city.

## Generation and editing

Surrounding, inside-city and edge-crossing proposals use a terrain seed independent of streets and water. Candidate geometry, square clearance, water separation and dry topology are validated before returning a preview. Water proposal generators accept a generic composition-validation callback, so the app can also retry river/coast/lake candidates that conflict with an existing mountain draft. The initial release supports six distinct ranges and twelve passes; range and water corridors must have ten units of separation. Separate ranges do not overlap. Regeneration explicitly targets a range ID, preserving its identity, name, center and compatible record/generation metadata.

Footprint and ridge drags use the gesture baseline and limit unsafe requested movement. Moving a range translates its ridge as well. Double-click insertion projects onto any closed foothill edge. Safe deletion retains at least four footprint handles and a valid ridge. Cancelled gestures restore the complete previous history and dirty state. Outline, water and terrain tools are mutually exclusive; their drafts and undo histories stay independent. Applying terrain rebuilds streets, buildings, districts and enabled defenses. District and defense histories reset against the new geometry; terrain undo restores a draft for explicit application.

Contours and peaks are a cartographic illustration of saved ridge heights, clipped to the footprint. They are not a physically calculated elevation mesh. The reserved footprint is the steep construction exclusion in this version. Continuous elevation, hillside construction, cliffs, tunnels, merged ranges and river erosion can be introduced through new terrain adapters without changing the existing water record kinds.

## Persistence and defenses

Schema 9 adds optional `terrainFeatures`, `terrainPasses` and `terrainFaces`. Older accepted cities retain their records exactly; migration increments the schema without injecting terrain or generating geometry. New cities write empty terrain collections until ranges are added. `workspace.terrainEditor` stores the draft, active range, selected point/pass, mode, dirty flag, twenty previous definitions and pending controls. Structural validation permits unfinished invalid geometry within bounded finite arrays; accepted cities require the full terrain and street validators. Workspace and container versions remain 1.

Walls store exact `terrainOpenings` with contributor IDs and wall-distance intervals. Their solid-segment, tower and gate routines respect water and terrain openings independently. The terrain defense adapter reuses generic polygon callbacks rather than introducing mountains into the water geometry registry. Corrupt terrain geometry, face references, pass spans and wall openings reject before replacing the current project.

See `QA.md` for automated coverage and the pending native Firefox checklist.
