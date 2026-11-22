# Group E — Project Size and Export Output

**Status:** Planning only. These are **two different future GitHub issue candidates** split from the original E01 finding.

| ID | Limitation | Suggested scope |
|---|---|---|
| [E01a](issues/E01a.md) | Rejects portable project files at or above 20 MiB | Capacity audit; increase only with measured memory and validation safety |
| [E01b](issues/E01b.md) | PNG export captures visible canvas only | Whole-city high-resolution export without changing the live camera |

## E01a — Project size

A higher import limit may be justified by large authored cities, but loading/parsing large JSON and maintaining recovery copies can be expensive. Keep `reject-before-mutate`, format validation, clear errors and standalone/browser memory safety. **Recommend measuring real project sizes before promising bigger files.**

## E01b — Whole-city PNG

The current export re-encodes the visible canvas. A full-city export should render the complete chosen bounds in an off-screen, bounded or tiled process, preserve selected layers, avoid changing live camera/editor state and produce predictable resolution. Decide whether the default bounds are survey outline, developed geometry or user-defined crop.

## Independent authorization

Neither proposal is an implementation authorization. Do not add required server rendering or a network dependency. A large-image feature may need memory-budget design and a staged export method before approval.