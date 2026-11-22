# Historical Phase 7 UI control inventory

> **Historical implementation reference, not current desktop navigation.** This records the four-section City/Landscape/Districts/Defenses shell from Phase 7. Published v0.2.0 uses **Generation / Add / Roads** on supported desktop browsers. Legacy controls are still retained for compact fallback and controller compatibility; old labels do not authorize deleting them. Consult the [user guide](../user-guide.md), [G3G parity review](../plans/0.2/G3G_PARITY_REVIEW.md), and [G4 acceptance](../plans/0.2/G4_ACCEPTANCE_REPORT.md).

Build `0.1-dev.ui7d` on `feature/ui-phase-7`. This inventory records the existing controls and their new persistence boundaries. IDs and controller bindings stay stable. Project schema remains 9, workspace schema 1; the UI state is optional and additive.

| Controls | New home | Behavior |
| --- | --- | --- |
| Freehand, Click points, Edit outline points, Close outline, Undo outline edit | City → Outline | Existing outline drawing, validation and history |
| Eight outline presets and Use | City → Outline → Starting shape | Expand to choose an initial shape; applying creates an outline draft |
| Place main square | City → Main square | Existing center placement |
| Street pattern and Street density | City → Streets | Pending generation settings; no rebuild until Generate city |
| Street seed and New street seed | City → Generation settings | Existing reproducible street generation |
| Revert outline & street edits | City, beneath Generation settings | Original `cancelButton`; restores accepted outline, square and street settings |
| Generate city and outline draft/error feedback | Shared tools footer | Same full generation action, available in every section |
| Download project, Load project | Top bar → Project | Same complete standalone project files |
| Validated load summary, Open project, Cancel | Top bar → Project | Selecting a file stages it; only Open project replaces the workspace |
| Latest/previous recovery and Keep this city | Top bar → Project | Existing browser recovery and backup decisions; attention dot indicates a decision is available |
| Project status/errors | Top bar → Project | Staged loads and file errors reveal the menu; the live status text remains attached to its original controller |
| Building footprints, Property boundaries, Plot divisions | Map header → Layers → Buildings & land | Existing visibility fields; no regeneration |
| District colors, borders, labels | Map header → Layers → Districts | Existing independent visibility fields |
| Fortifications visibility | Map header → Layers → Defenses | Hides drawing; Walls enabled still controls the saved defense model |
| Select / Pan, Fit, Zoom in/out | Shared map rail | Click selects landscape or a district; drag pans; same camera/fit/zoom behavior |
| River seed and New river seed | Selected River → Inspector → Generation settings | Same seed/reroll actions |
| River width, Generate/Edit/Remove river, Tidy bends | Selected River → Inspector | Existing guided river draft tools |
| Move bridges and Add bridge | Selected River → Inspector | Existing editable crossings |
| Coast seed and New coast seed | Selected Coastline → Inspector → Generation settings | Same seed/reroll actions |
| Ocean direction, Generate coastline, Edit shoreline, Swap land/water, Tidy bends, Remove coastline | Selected Coastline → Inspector | Coastline remains independent of river/lakes |
| Lake selection, size, Create/Regenerate/Edit/Move/Remove lake | Selected Lake → Inspector | Select via Landscape list/map; create via Add feature; original selected-lake control stays mounted and hidden |
| Lake seed | Selected Lake → Inspector → Generation settings | Pending selected/new lake generation input |
| Remove selected water point/bridge, Undo, Revert draft, water status | Selected water feature → Inspector, shared history/status | Existing shared water editor and history |
| Mountain seed | Selected Mountain range → Inspector → Generation settings | Existing pending generation input |
| Range selection, placement, size, height, Create/Regenerate/Edit foothills/Move/Edit ridge/Remove | Selected Mountain range → Inspector | Select via Landscape list/map; create via Add feature; original range selector stays mounted and hidden |
| Move/Add road pass, Remove point/pass, Undo/Revert, terrain status | Selected Mountain range → Inspector | Existing pass editing and scoped terrain history |
| Add feature and creation type | Landscape → Add feature → Inspector | Creation fields/actions only for the chosen available type |
| All / Water / Mountains | Landscape, above feature list | Filters records without changing geometry or selection |
| Undo water / Undo mountains | Landscape → Draft histories | Existing editor undo remains available after a selected record is removed |
| District count, Generate/rebuild districts | Districts → Neighborhoods | Existing district-only generation |
| District seed | Districts → Neighborhoods → Generation settings | Existing pending district seed |
| District list, selection | Districts → Neighborhoods | Stable district IDs; list and map selection reveal the contextual inspector and map selection scrolls to the matching row |
| District name/color, Apply district changes, selected block, receiving district, Move selected block | Right selection inspector → Neighborhood | Existing local editing, strict connected membership validation and UI bindings |
| Undo district edit, district generation/status | Districts → Neighborhoods | Existing 20-snapshot scoped history and generation feedback |
| Walls enabled, requested gates, tower spacing | Defenses → Perimeter defenses | Existing generation/enable controls, with input feedback that does not alter geometry |
| Update defenses, Undo defense edit, status/preview | Defenses → Perimeter defenses | Scoped apply and undo; distinguishes building, disabling, re-enabling and regenerating walls without full city rebuild |
| Fortification seed | Defenses → Fortifications → Generation settings | Existing pending defense seed |
| Inspector summaries, Clear selection, Pin, city report/guide | Shared right inspector | Landscape and district contextual forms; defense controls remain in Defenses |
| Collapse/reopen tools and inspector, four section tabs | Shared panel headings/map header/top bar | Same Phase 1 shell state and draft-safe navigation |

Project and Layers are nonmodal panels with normal buttons, form controls and Tab navigation. Opening either closes the other. Escape closes the panel and returns focus to its opener without cancelling the active map tool. Moving focus outside or clicking outside closes it; its fields and staged file remain intact. Arrow Down on an opener enters its controls. Menus remain available when the side panels collapse.

Generation settings and Starting shape disclosures keep their DOM controls mounted. Closing them or switching sections leaves pending values unchanged. New disclosure/menu visibility has no persistence fields in this phase; saved inputs and layer values retain their existing format and exact load behavior.

Creation uses the corresponding inspector form with Create actions. Selecting an existing feature exposes only its own regeneration, shape/movement, crossings and removal controls. The list replaces the former lake/range dropdowns as the visible selection surface. Those old elements stay mounted for controller and file compatibility.

## Phase 5 additions

| Controls | Location | Behavior |
| --- | --- | --- |
| Pending update count | Top bar | Counts actual unapplied outline/center/street/water/terrain changes separately from local district/defense pending values |
| Rebuild city, pending update categories, rebuild consequences | Shared tools footer | Full city rebuild action remains visible from every section; expandable explanation makes replacement scope explicit |
| Contextual Undo and scope guidance | Shared map rail/status | Delegates to existing independent history for active tool or section; Ctrl/Cmd+Z follows the same selection |
| Revert outline & street settings | City | Restores accepted outline and street generation controls without affecting other editors |
| Inline error and input invalid states | Current district/defense form, water/terrain messages and rebuild footer | Failed operations preserve accepted city geometry and explain what to correct |
| Per-section scroll position | Shared tools scroller | Retains City, Landscape, Districts and Defenses positions within the current session; project reset clears the cache |

Phase 6 adds optional bounded UI presentation fields without changing accepted geometry, project schema 9, workspace schema 1, or container version 1.

## Phase 6 additions

| Controls | Persistence and behavior |
| --- | --- |
| Active tab; Tools and Inspector collapse/pin | `workspace.ui.section`, `toolsCollapsed`, `inspectorCollapsed`, `inspectorPinned` |
| Selected district, landscape or creation form | `workspace.ui.selection`; legacy `view.landscapeSelection` remains accepted and stale IDs clear |
| Tool/inspector scroll positions | `workspace.ui.sectionScroll`, `inspectorScroll` |
| Expandable generation and help panels | `workspace.ui.disclosures` |
| Landscape filter and per-feature inputs | `workspace.ui.landscape` bounded cache |
| Pending district names and colors | `workspace.ui.districts` bounded cache |
| Editing shortcuts and pointer ownership | Native text entry remains unaffected; active visible editor owns map input, original undo histories remain scoped |
| Desktop, ultrawide and narrow layout | CSS adapts map/panels; `workspace.view.camera` remains authoritative and geometry-neutral |

## Phase 7 control-inventory audit

The scripted inventory comparison of the last pre-overhaul single-file build `0.1-dev.3e6` against the current HTML template found **93/93 original interactive control IDs retained**, with the same button/input/select/textarea element types. The new shared controls are additive. This verifies control presence, not every possible use-case; the Node regression suite and Firefox/Chromium smoke matrix exercise behavior separately. The Phase 7C CSS fix ensures the narrow Tools and Inspector drawer headers receive pointer events above the map toolbar.
