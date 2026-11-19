# Mappo 0.2D road editing experience

0.2D makes the road-first workflow established in 0.2C easy to use on a developed city. The everyday path is **select → move → see what changes → Apply**. Mappo handles eligible generated development automatically. When an edit affects custom or older work that needs a decision, the map shows the obstruction and the editor offers the next step.

Start from the accepted C7 baseline. Manual parcel creation, splitting, merging, boundary editing, and plot division follow in a later milestone. The later phase labels can be settled with that roadmap. Schema 9, local adaptation, authored-record protection, and exact Undo/Redo and reload are part of the existing road-edit contract.

## Goals

- **Understand the preview at a glance.** Make the selected and proposed road easy to distinguish and highlight the part of the city that will change. Show checking, ready, and blocked states beside the map action that follows.
- **Ask for fewer decisions.** Automatically adapt eligible generated work. For a protected building, give a clear primary choice and show its consequences before Apply.
- **Make blocked drafts recoverable.** Keep the user's intended placement visible, point to the actual obstruction, and offer a relevant next action.
- **Keep the underlying evidence inspectable.** Show everyday counts and plain language first. Put record IDs, detailed ownership changes, and geometry diagnostics in expandable Details.

## D1 · Map preview and change summary

- [ ] Review the current road inspector on desktop and phone. Trace where street selection, drag, outcome, decision, and Apply happen. Use this to choose a stable location for the primary actions and status.
- [ ] Show the accepted and proposed street positions and enough of the affected neighborhood to understand the move. Distinguish moved, rebuilt, and protected buildings with text or shape cues as well as color. Keep unaffected development visually quiet.
- [ ] Summarize actual dispositions from the validated candidate. A summary such as “3 buildings move, 2 are rebuilt” must distinguish relocation from regeneration, and avoid counting both sides of a replacement as two buildings.
- [ ] Group old and new parcels, plots, and buildings by the affected block or split/merge group in **Details**. Preserve known successor IDs and show group-level regeneration where individual ancestry is unavailable. Provide a way to locate records on the map.
- [ ] Verify the user can predict the changed area and tell whether the edit is ready before opening Details. Check big changes, zero changes, stale previews, and keyboard/pointer/touch navigation.

## D2 · Building decisions in context

- [ ] When an affected custom or older building needs approval, highlight it and state the relationship in plain language. Use names when available and keep the active road draft visible.
- [ ] Make **Suggest a new location** the primary action when a placement can be proposed. Offer **Keep it here** when keeping the exact footprint is viable, and explain why it is unavailable otherwise. Put exact coordinates and rotation under **More options**.
- [ ] Show the proposed footprint and access on the map before the user commits. Support changing or clearing a choice and show where the user is when multiple buildings need decisions.
- [ ] Scope decisions to the current draft and affected building. Revalidate choices if the road geometry or accepted city changes. Explicit approval and Apply remain required before authored geometry moves.
- [ ] Verify fixed, relocated, rejected-placement, multi-building, and cancel paths. Confirm generated-only changes proceed without extra approval dialogs.

## D3 · Recovery when a road move is blocked

- [ ] Connect each supported blocker to its map location and a useful next action. Cover protected infrastructure, an invalid crossing, unresolved ownership, and building or access conflicts.
- [ ] Keep the desired position drawn while the user adjusts it. Explain the first actionable blocker near Apply and make additional blockers available in Details.
- [ ] Explore a bounded nearby-placement suggestion for blockers where a small adjustment may help. Offer it only when a validated alternative can be shown. The user chooses whether to preview it, and Apply still commits the selected preview explicitly.
- [ ] Show checking state promptly and discard superseded results. Preserve keyboard and touch control during report updates, scrolling, and conflict navigation.
- [ ] Verify both cases where a nearby valid alternative exists and where the useful action is to adjust, cancel, or edit the relevant protected feature separately.

## D4 · End-to-end usability and release review

- [ ] In fresh-user walkthroughs, ask participants to move a street through generated development, reshape a junction or bend, and handle a custom-building conflict. Record where they get stuck, what they think will change, and whether they need Details, a record ID, or coaching.
- [ ] Verify across all four layouts and on developed Small and Large maps. Include older schema-9 data, one topology change, a blocked draft, and a rejected building choice. Test keyboard, screen reader, and physical touch alongside the Chromium/Firefox viewport suites.
- [ ] Verify preview and cancel preserve accepted work and recovery. Verify one Apply, one Undo, Redo, and portable save/reload for generated and authorized custom changes. Check that unrelated records remain untouched.
- [ ] Reuse the C7 timing fixtures to compare responsiveness and verify that summaries and overlays do not materially worsen interaction. Record evidence and resolve reproducible blockers.
- [ ] Build the versioned offline standalone, verify root parity, run the full test suite, and present the completed milestone for review with the walkthrough and test results.

**Completion test:** A user can place a road, understand the proposed neighborhood change, resolve a custom-building conflict if needed, and apply or cancel without a walkthrough or opening the technical report. Undo restores the whole accepted edit.
