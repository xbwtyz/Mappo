# Mappo 0.2D road editing experience

**Status** · D1–D3 merged in PRs #51–#53. D4 acceptance/stabilization completed and verified in [PR #56](https://github.com/xbwtyz/Mappo/pull/56) against the pre-D4 `main` baseline (`42b295a`). Both required GitHub CI checks passed. Refer to the PR for merge status.

0.2D makes the existing road editor easier to read and recover from when a
move affects a developed neighborhood. The normal path is **select → move →
review what changes → Apply**. A blocked edit should show the obstruction and
a useful next action in the same panel.

## What the current editor already does

| Area | C7/P7 on main | Remaining 0.2D work |
| --- | --- | --- |
| Preview and Apply | The map draws current and proposed geometry, including the intended road position for blocked drafts. The panel already keeps Apply, Reset, and Cancel in its footer. | Give one status priority near Apply. Show the neighborhood consequences before technical controls and reports, and make changed map features stand out. |
| Change reporting | The preview shows geometry rows by record type, raw counts, metrics, and map links. The separate impact report already groups similar diagnostics. | Summarize the settled outcome at the level of roads, blocks and buildings. Group related records in Details using only the ownership and successor data the engine can prove. |
| Building choices | **Resolve conflict** expands the panel and locates the named building. Fixed, automatic, and exact placement choices already feed reflow. Successful proposals can already show old and new footprints. | Put the primary choice beside the blocker, fold precision fields away, and keep individual decisions available after a successful preview. The current UI offers a global clear action and removes a building's controls when its conflict clears. |
| Blocked edits | The footer explains why Apply is disabled, with a shortcut for building conflicts. The map already retains the user's intended position during ordinary blocked moves. | Give other actionable blockers a map target and a concrete recovery action. Preserve the proposal through locating a blocker or inspecting Details. |
| Safety and performance | Draft revisions, stale-result rejection, independent Apply validation, Undo/Redo, schema-9 compatibility, and offline packaging already exist. P7 profiled and reduced validation and recovery work. | Verify those behaviors through the revised controls. Keep [#44](https://github.com/xbwtyz/Mappo/issues/44) as the follow-up for reproducible input stalls. |

Source review covered `index.template.html`, `styles/app.css`,
`src/ui/road-inspection.js`, `src/editor/road-preview.js`,
`src/core/road-inspection.js`, `src/renderer/road-inspection.js`,
and the reflow ledger. A scripted named-building case on Chromium desktop
and Firefox at phone viewport size confirmed that **Resolve conflict**
opens and focuses the existing choices, a proposed placement renders the
old and new footprints, and the individual choice then disappears.

## D1 · Make the preview readable by default

- [x] Use the existing map and panel. Put plain-language state, a compact
  impact summary, and Apply/Reset/Cancel in the primary view. Reuse the footer
  and keep it reachable when the body scrolls or is minimized. Retain numeric
  placement, record selection, and topology tools behind contextual controls.
- [x] Make existing and proposed road geometry distinguishable by line style
  and labels. Highlight changed blocks and relevant buildings. Keep the
  proposal legible on the phone layout with the panel open. Use text and shape
  cues alongside color.
- [x] Summarize a settled candidate from its ledger and verified geometry.
  Separate moved buildings, regenerated development, access-only changes,
  and unresolved decisions. Collapse related old and new records so a
  replacement isn't counted twice. Show group-level regeneration when the
  ledger lacks one-to-one ancestry. An unavailable or topology-only preview
  displays its limited scope and keeps Apply disabled.
- [x] Put record IDs, source and successor links, measurements, and full
  diagnostics under **Details**. Keep existing Locate behavior available
  there. Use a primary live status for meaningful state transitions.
- [x] Verify one generated-only move, one topology change, and checking,
  stale, zero-change, and blocked states. Assert that status, next action,
  and verified scope are visible with Details closed on desktop and phone.

D1 ships as `0.2-dev.d1`. The extended road browser suite checks status
and consequences with Details closed, compact controls, exact grouped counts,
and existing conflict navigation. Node acceptance also checks a settled
preview after its accepted revision becomes stale.

## D2 · Keep building decisions beside the affected edit

- [x] Reuse the existing building choice and map-location paths. Present
  **Suggest a new location** as the primary action where relocation can be
  attempted. Put precise coordinates and rotation under **More options**.
  Offer **Keep it here** as a preview attempt when appropriate. Explain a
  known rejection for the current draft without running extra geometry
  checks just to present the panel.
- [x] Show original and proposed footprints, plus access changes where
  verified geometry is available. Retain a compact list of pending and made
  choices. Let the editor revisit or clear an individual choice, retaining
  other choices only when they still validate for that draft. With multiple
  conflicts, display unresolved choices before claiming a settled preview.
- [x] Tie each choice to the building and current road draft. Keep the
  existing explicit authorization for authored changes and one final Apply.
  Generated-only moves use the normal review-and-Apply path.
- [x] Test named and older buildings, fixed and rejected placement,
  relocation, multiple conflicts, clearing one choice, stale draft changes,
  keyboard focus, and cancelling while a placement is checking.

D2 implementation: the ordinary preview now presents named protected buildings and an actionable choice next to the road draft. Suggestions come first, fixed-footprint attempts remain available, invalid fixed choices explain why they failed, and precision coordinates live under More options. Decisions remain individually revisable/clearable even after the candidate preview succeeds. All decisions are scoped to a validated draft; they never modify the accepted project until the independently verified atomic Apply. No required walkthroughs or onboarding.

## D3 · Make blocked moves recoverable

- [x] Map structured blocker codes to plain-language explanations and actions.
  Start with protected infrastructure, invalid crossings, unresolved
  ownership, and building or access conflicts. Use the existing Locate path
  when there is a trustworthy map target. Offer Adjust, Reset, or Cancel
  according to the situation. Retain extra diagnoses in Details.
- [x] Keep the intended road visible while locating an obstruction, changing
  a choice, or adjusting the draft. During recalculation, clear obsolete
  summaries and keep the latest-draft safeguards on Apply.
- [x] Verify a protected feature, an invalid crossing, a blocked building
  choice, and an obstruction without reliable map geometry. Test normal
  pointer, keyboard, and simulated touch actions, including focus return.
- [x] Defer the earlier nearby-placement search proposal. This cycle makes
  the existing blockers actionable and avoids adding a new search workload
  to the preview path.

D3 delivery: structured diagnostics are mapped to clear explanations for
protected infrastructure, crossings, block/plot ownership, building decisions,
and access. Recovery actions focus the relevant editable controls or building
choice, safely locate only an existing accepted map feature, and expose technical
Details on request. Reset and Cancel remain in the unchanged footer. No nearby
placement search is introduced. During preview recalculation, stale blocker
cards disappear; new drafts clear obstruction highlights. All safety checks,
authorizations, offline saves, and independent Apply remain authoritative.
Automated Node and browser tests cover ordinary and blocked paths, keyboard
focus, map navigation, and draft preservation. D4 still owns final end-to-end
accessibility and performance acceptance across all layouts.

## D4 · Verify the complete editing path

- [x] Extend scripted Chromium and Firefox cases for the ordinary generated
  path, a junction or bend, a topology change, a blocked draft, and a
  custom-building conflict. Cover all four supported layouts across the suite,
  developed Small and Large fixtures, and existing schema-9 data.
- [x] Check desktop and phone-sized layouts for reachable controls and a
  usable map. Verify tab order, visible focus, names and descriptions,
  programmatic status changes, and simulated touch input. Use repository
  fixtures and automated checks for acceptance. The product opens directly
  into the editing workflow without onboarding prompts or required tours.
- [x] Confirm that preview, Reset, and Cancel preserve accepted geometry,
  recovery, and history. Confirm exactly one Apply transaction, whole-edit
  Undo/Redo, and portable save/reopen for generated and authorized custom
  changes. Check that independent validation still rejects stale proposals.
- [x] Repeat the C7 responsiveness fixtures against the starting build under
  the same runner and benchmark settings. Record preview latency, input
  and frame gaps, and any reproducible regression from the new UI. Keep
  general performance follow-up in [#44](https://github.com/xbwtyz/Mappo/issues/44).
- [x] Build the versioned offline HTML, verify root parity, and record results
  from the full Node and browser suites.

**D4 implementation:** `scripts/d4-browser-acceptance.mjs` extends the existing Chromium/Firefox four-viewport road suite with large developed-city previews, keyboard focus and status semantics, schema-9 provenance-unknown blockers, and accepted-data isolation. The focused verification passed 10/10 Node and 4/4 new browser scenarios. Two same-runner C7 comparisons measured preview, frame/input gaps and Apply; median previews stayed within a few percent of baseline, while a single worst-case Firefox Large-phone gap did not repeat. Details, fixtures, raw reports, and remaining performance caveat are recorded in [D4 acceptance report](D4_ACCEPTANCE_REPORT.md). The complete [D4 CI run](https://github.com/xbwtyz/Mappo/actions/runs/44698777095) passed: 411/411 Node regression tests, 8/8 general browser checks, 8/8 property/building checks, 8/8 road editor checks, 4/4 new D4 browser checks, and compiled root/distribution parity. D4 implementation acceptance is complete; the PR remains the source of truth for its merge status.

**Completion criterion** · The scripted editing cases can select a road,
identify the verified scope, resolve a conflict when required, and Apply or
cancel with Details closed. A single Undo restores the whole edit. Acceptance
requires zero participant recruitment, mandatory walkthroughs, feedback
prompts, or owner-run checks.

Manual parcel creation, splitting, merging, boundary editing, and plot
division remain follow-up work. The existing schema and local reflow rules
carry through this milestone.
