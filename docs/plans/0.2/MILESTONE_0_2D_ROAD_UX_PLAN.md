# Mappo 0.2D road editing experience

**Status** · Revised plan for review. Baseline is merged C7/P7 at `8f1f6f2`.

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

- [ ] Use the existing map and panel. Put plain-language state, a compact
  impact summary, and Apply/Reset/Cancel in the primary view. Reuse the footer
  and keep it reachable when the body scrolls or is minimized. Retain numeric
  placement, record selection, and topology tools behind contextual controls.
- [ ] Make existing and proposed road geometry distinguishable by line style
  and labels. Highlight changed blocks and relevant buildings. Keep the
  proposal legible on the phone layout with the panel open. Use text and shape
  cues alongside color.
- [ ] Summarize a settled candidate from its ledger and verified geometry.
  Separate moved buildings, regenerated development, access-only changes,
  and unresolved decisions. Collapse related old and new records so a
  replacement isn't counted twice. Show group-level regeneration when the
  ledger lacks one-to-one ancestry. An unavailable or topology-only preview
  displays its limited scope and keeps Apply disabled.
- [ ] Put record IDs, source and successor links, measurements, and full
  diagnostics under **Details**. Keep existing Locate behavior available
  there. Use a primary live status for meaningful state transitions.
- [ ] Verify one generated-only move, one topology change, and checking,
  stale, zero-change, and blocked states. Assert that status, next action,
  and verified scope are visible with Details closed on desktop and phone.

## D2 · Keep building decisions beside the affected edit

- [ ] Reuse the existing building choice and map-location paths. Present
  **Suggest a new location** as the primary action where relocation can be
  attempted. Put precise coordinates and rotation under **More options**.
  Offer **Keep it here** as a preview attempt when appropriate. Explain a
  known rejection for the current draft without running extra geometry
  checks just to present the panel.
- [ ] Show original and proposed footprints, plus access changes where
  verified geometry is available. Retain a compact list of pending and made
  choices. Let the editor revisit or clear an individual choice, retaining
  other choices only when they still validate for that draft. With multiple
  conflicts, display unresolved choices before claiming a settled preview.
- [ ] Tie each choice to the building and current road draft. Keep the
  existing explicit authorization for authored changes and one final Apply.
  Generated-only moves use the normal review-and-Apply path.
- [ ] Test named and older buildings, fixed and rejected placement,
  relocation, multiple conflicts, clearing one choice, stale draft changes,
  keyboard focus, and cancelling while a placement is checking.

## D3 · Make blocked moves recoverable

- [ ] Map structured blocker codes to plain-language explanations and actions.
  Start with protected infrastructure, invalid crossings, unresolved
  ownership, and building or access conflicts. Use the existing Locate path
  when there is a trustworthy map target. Offer Adjust, Reset, or Cancel
  according to the situation. Retain extra diagnoses in Details.
- [ ] Keep the intended road visible while locating an obstruction, changing
  a choice, or adjusting the draft. During recalculation, clear obsolete
  summaries and keep the latest-draft safeguards on Apply.
- [ ] Verify a protected feature, an invalid crossing, a blocked building
  choice, and an obstruction without reliable map geometry. Test normal
  pointer, keyboard, and simulated touch actions, including focus return.
- [ ] Defer the earlier nearby-placement search proposal. This cycle makes
  the existing blockers actionable and avoids adding a new search workload
  to the preview path.

## D4 · Verify the complete editing path

- [ ] Extend scripted Chromium and Firefox cases for the ordinary generated
  path, a junction or bend, a topology change, a blocked draft, and a
  custom-building conflict. Cover all four supported layouts across the suite,
  developed Small and Large fixtures, and existing schema-9 data.
- [ ] Check desktop and phone-sized layouts for reachable controls and a
  usable map. Verify tab order, visible focus, names and descriptions,
  programmatic status changes, and simulated touch input. Use repository
  fixtures and automated checks for acceptance. The product opens directly
  into the editing workflow without onboarding prompts or required tours.
- [ ] Confirm that preview, Reset, and Cancel preserve accepted geometry,
  recovery, and history. Confirm exactly one Apply transaction, whole-edit
  Undo/Redo, and portable save/reopen for generated and authorized custom
  changes. Check that independent validation still rejects stale proposals.
- [ ] Repeat the C7 responsiveness fixtures against the starting build under
  the same runner and benchmark settings. Record preview latency, input
  and frame gaps, and any reproducible regression from the new UI. Keep
  general performance follow-up in [#44](https://github.com/xbwtyz/Mappo/issues/44).
- [ ] Build the versioned offline HTML, verify root parity, and record results
  from the full Node and browser suites.

**Completion criterion** · The scripted editing cases can select a road,
identify the verified scope, resolve a conflict when required, and Apply or
cancel with Details closed. A single Undo restores the whole edit. Acceptance
requires zero participant recruitment, mandatory walkthroughs, feedback
prompts, or owner-run checks.

Manual parcel creation, splitting, merging, boundary editing, and plot
division remain follow-up work. The existing schema and local reflow rules
carry through this milestone.
