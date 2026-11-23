# Group E — Project Size and Export Output

The original E01 finding tracks project import capacity and whole-city PNG export separately.

| ID | Limitation | Suggested scope |
|---|---|---|
| [E01a](../issues/E01a.md) · [#109](https://github.com/xbwtyz/Mappo/issues/109) | Rejects portable projects larger than 20 MiB | The D03 audit found no generated sample approaching the limit. A capacity increase remains deferred. |
| [E01b](../milestones/0.2.12-whole-city-png.md) · [#110](https://github.com/xbwtyz/Mappo/issues/110) | Whole-city PNG export | Merged into `main` in [PR #124](https://github.com/xbwtyz/Mappo/pull/124). |

## E01a — Project size

A higher import limit may be justified by large authored cities, but loading/parsing large JSON and maintaining recovery copies can be expensive. Keep `reject-before-mutate`, format validation, clear errors and standalone/browser memory safety. **Recommend measuring real project sizes before promising bigger files.**

## E01b — Whole-city PNG

Whole-city PNG export renders the developed city or full survey bounds on a separate canvas, using the current layers. The existing visible-map export still captures the active canvas.

## Independent authorization

An import capacity increase or expanded export scope requires separate implementation approval.
