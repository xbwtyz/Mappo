# Mappo 0.1-dev.3b validation

## Automated checks

**30 automated tests passed.**

Run `npm run check` to rebuild and run the complete suite. All road-crossing checks remain enabled.

### Building placement

The new placement stress group covers 96 combinations: eight editable outlines × three street densities × four street patterns.

Checks include:

- Properties stay inside their block with clearance from the full rendered street width.
- Property envelopes have no positive-area overlap.
- Each base plot belongs to exactly one property; their combined area matches the property area.
- Each building fits inside its property and references exactly the plots its footprint occupies.
- Multi-plot buildings, courtyard holes, separate compound wings, attached rows and varying footprint areas exist in representative cities.
- Shared walls are allowed for attached rows; overlapping compound or row footprints are rejected.
- Each entrance access segment reaches the referenced frontage street.
- Open space remains and no property is allocated to the civic plaza.
- Populating blocks does not change street nodes, roads, block geometry or plaza geometry.
- Same inputs reproduce the complete project data.
- Runtime validation rejects overlapping properties and invalid references or escaped footprints.

### Existing geometry coverage

The previous 1,024 street configurations are still generated and tested, now with runtime-validated building population:

| Group | Configurations |
| --- | ---: |
| Seeded radial streets across three densities | 360 |
| Four street patterns across sizes and seeds | 480 |
| Eight starting outlines × three densities × four patterns | 96 |
| Former profile extremes and street patterns | 40 |
| Rotated, translated and perturbed concave outlines | 48 |

Additional tests check 1,200 survey configurations, reproducible IDs, invalid inputs, camera behavior, standalone HTML parity, drawing gestures and undo. The compiled app tests also exercise building/property counts, all three display layers and retention of the last good city after invalid generation. These tests use a simulated DOM and Canvas.

## Rendering checks

The production Canvas renderer was used with a native Canvas implementation to inspect full-city views for all four street patterns and a zoomed view of individual roofs. This checks generated geometry, building forms and drawing, not browser layout or native browser pointer delivery.

## Graphical browser limitation

The host previously denied Chromium's process-singleton socket. No full graphical Chromium or Firefox pass is claimed for this milestone. The remaining Firefox checks are listed below.

## Manual Firefox checklist

Open `dist/mappo-0.1-dev.3b.html` directly from disk.

- Generate all four street patterns. Confirm variation in building sizes, shapes, spacing and open ground.
- Zoom in on an L-shaped building, courtyard, compound and attached row. Confirm streets and the main square remain unobstructed.
- Toggle buildings, property boundaries and plot divisions. Find a large building extending across several plot divisions.
- Draw a concave or branching outline; generate buildings inside it.
- Move the town center and regenerate; confirm no building occupies the new square.
- Change seed and density. Confirm the chosen outline and center remain fixed.
- Drag, add and remove outline points; test Undo edit and Revert edits.
- Try a crossed outline and narrow neck. Confirm a useful message and retention of the prior city.
- Pan, zoom, fit and resize. Check layer controls remain reachable by scrolling the left panel on narrow windows.
- Keep the page open when preserving a custom city: save/load is still a later milestone.
