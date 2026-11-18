# UI control locations — Phase 2

Build `0.1-dev.ui2`. This inventory records the new homes of the existing controls. IDs and controller bindings stay stable. Project schema remains 9; shell menu/disclosure visibility is runtime-only until the workspace persistence phase.

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
| Select / Pan, Fit, Zoom in/out | Shared map rail | Click selects a district; drag pans; same camera/fit/zoom behavior |
| River seed and New river seed | Landscape → Water & Bridges → River → Generation settings | Same seed/reroll actions |
| River width, Generate/Edit/Remove river, Tidy bends | Landscape → Water & Bridges → River | Existing guided river draft tools |
| Move bridges and Add bridge | Landscape → Water & Bridges → River | Existing editable crossings |
| Coast seed and New coast seed | Landscape → Water & Bridges → Coastline → Generation settings | Same seed/reroll actions |
| Ocean direction, Generate coastline, Edit shoreline, Swap land/water, Tidy bends, Remove coastline | Landscape → Water & Bridges → Coastline | Coastline remains independent of river/lakes |
| Selected lake, size, Add/Regenerate/Edit/Move/Remove lake | Landscape → Water & Bridges → Lakes | Existing independent lake records and geometry tools |
| Lake seed | Landscape → Water & Bridges → Lakes → Generation settings | Pending selected/new lake generation input |
| Remove selected water point/bridge, Undo, Revert draft, water status | Landscape → Water & Bridges, below feature groups | Existing shared water editor and history |
| Mountain seed | Landscape → Mountains & Passes → Generation settings | Existing pending generation input |
| Selected range, placement, size, height, Add/Regenerate/Edit foothills/Move/Edit ridge/Remove | Landscape → Mountains & Passes | Existing independent range records and geometry tools |
| Move/Add road pass, Remove point/pass, Undo/Revert, terrain status | Landscape → Mountains & Passes | Existing pass editing and scoped terrain history |
| District count, Generate/rebuild districts | Districts → Neighborhoods | Existing district-only generation |
| District seed | Districts → Neighborhoods → Generation settings | Existing pending district seed |
| District selection, name/color, Apply, receiving district, Move block, Undo, district status | Districts → Neighborhoods | Existing local editing and connected membership validation |
| Walls enabled, gates, tower spacing, Build/update, Undo, defense status | Defenses → Fortifications | Existing defense-only updates |
| Fortification seed | Defenses → Fortifications → Generation settings | Existing pending defense seed |
| Inspector summaries, Open editing controls, Clear selection, Pin, city report/guide | Shared right inspector | Phase 1 providers; full landscape/district forms remain later phases |
| Collapse/reopen tools and inspector, four section tabs | Shared panel headings/map header/top bar | Same Phase 1 shell state and draft-safe navigation |

Project and Layers are nonmodal panels with normal buttons, form controls and Tab navigation. Opening either closes the other. Escape closes the panel and returns focus to its opener without cancelling the active map tool. Moving focus outside or clicking outside closes it; its fields and staged file remain intact. Arrow Down on an opener enters its controls. Menus remain available when the side panels collapse.

Generation settings and Starting shape disclosures keep their DOM controls mounted. Closing them or switching sections leaves pending values unchanged. New disclosure/menu visibility has no persistence fields in this phase; saved inputs and layer values retain their existing format and exact load behavior.
