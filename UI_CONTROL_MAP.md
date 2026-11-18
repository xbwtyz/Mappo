# UI control locations — Phase 3

Build `0.1-dev.ui3`. This inventory records the new homes of the existing controls. IDs and controller bindings stay stable. Project schema remains 9; shell menu/disclosure visibility is runtime-only until the workspace persistence phase.

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
| District selection, name/color, Apply, receiving district, Move block, Undo, district status | Districts → Neighborhoods | Existing local editing and connected membership validation |
| Walls enabled, gates, tower spacing, Build/update, Undo, defense status | Defenses → Fortifications | Existing defense-only updates |
| Fortification seed | Defenses → Fortifications → Generation settings | Existing pending defense seed |
| Inspector summaries, Open editing controls, Clear selection, Pin, city report/guide | Shared right inspector | Landscape summaries plus contextual forms; district forms remain Phase 4 |
| Collapse/reopen tools and inspector, four section tabs | Shared panel headings/map header/top bar | Same Phase 1 shell state and draft-safe navigation |

Project and Layers are nonmodal panels with normal buttons, form controls and Tab navigation. Opening either closes the other. Escape closes the panel and returns focus to its opener without cancelling the active map tool. Moving focus outside or clicking outside closes it; its fields and staged file remain intact. Arrow Down on an opener enters its controls. Menus remain available when the side panels collapse.

Generation settings and Starting shape disclosures keep their DOM controls mounted. Closing them or switching sections leaves pending values unchanged. New disclosure/menu visibility has no persistence fields in this phase; saved inputs and layer values retain their existing format and exact load behavior.

Creation uses the corresponding inspector form with Create actions. Selecting an existing feature exposes only its own regeneration, shape/movement, crossings and removal controls. The list replaces the former lake/range dropdowns as the visible selection surface. Those old elements stay mounted for controller and file compatibility.
