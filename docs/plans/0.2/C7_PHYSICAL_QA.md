# C7 physical-touch, keyboard and screen-reader acceptance worksheet

This is a **manual gate**, not a report of completed testing. Browser automation
and synthetic PointerEvents do **not** satisfy the physical-device requirements.

## Record the environment for every run

- Build/commit SHA:
- Device manufacturer/model and OS:
- Browser and exact version:
- Input: touch / physical keyboard / screen reader name and version:
- Viewport or screen resolution:
- Tester, date and evidence URL:

## Physical touch, real device

- [ ] Small Planned, seed `c2-planned`, drag ordinary road `RD-0113` to a visible offset. Check that the target remains visible, Apply follows the checked candidate, Cancel leaves the accepted city unchanged, and a second drag starts at the displaced ghost.
- [ ] Small Radial, seed `c2-radial`, drag junction `N-0101` approximately 15 units in Y. Check crossing normalization, finger release, complete Apply/Undo and project reload.
- [ ] Small Planned, select `RD-0113`, Edit bends, Add bend; drag with a finger, release, cancel a new gesture, and test one-unit snapping and exact coordinate entry.
- [ ] With a draft open, pan/pinch the map without moving the selected road. Verify pointer cancellation restores the expected draft.
- [ ] On the smallest supported screen, scroll the road panel while checking Apply status, Resolve conflict and building options; confirm no critical control is obscured.

## Physical keyboard only

- [ ] In Small Radial, enter Road Inspection without using a pointer and choose junction `N-0101` through the labeled selection controls.
- [ ] Focus the map and nudge the junction. Check visible focus, blocked/checking/ready status and no unwanted browser scrolling.
- [ ] Cancel a draft; then make a valid move and Apply, Undo and Redo using keyboard-accessible controls.
- [ ] Add a custom name to `BLD-00048` on the same Small Radial fixture, try Y +15, and verify the conflict must be explicitly resolved.
- [ ] Minimize the road panel. Activate Resolve conflict from the collapsed state, verify the panel expands, focus enters the choices and keyboard navigation can leave them again.

## Actual screen reader (e.g., NVDA with Firefox, VoiceOver, or Orca)

- [ ] Observe checking, blocked and ready state announcements with speech. Verify each meaningful transition is announced once, without repeated chatter on unrelated map redraws.
- [ ] Activate Resolve conflict while the panel is minimized. Confirm focus reaches the affected building's first choice and its label is announced.
- [ ] Navigate and exit the coordinate and placement controls; verify fields and buttons have understandable names and status does not silence them.
- [ ] Repeat with a rejected/protected draft and record the exact announcement and focus behavior.

## Evidence and issue tracking

| Test | Device/browser/screen reader | Result (pass/fail/not run) | Evidence or issue |
| --- | --- | --- | --- |
| Street touch | — | Not run | — |
| Junction touch | — | Not run | — |
| Bend touch and cancel | — | Not run | — |
| Pan/pinch and panel scroll | — | Not run | — |
| Keyboard-only junction workflow | — | Not run | — |
| Keyboard conflict and focus | — | Not run | — |
| Screen reader announcements | — | Not run | — |
| Screen reader conflict and focus | — | Not run | — |

If a failure occurs, include its smallest reproducer, expected/observed behavior
and follow-up verification against the fixing commit. **Do not mark the C7
physical/AT acceptance complete before these checks are actually performed.**
