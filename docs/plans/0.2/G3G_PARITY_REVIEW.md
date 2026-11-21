# Mappo 0.2G G3G — Desktop parity and legacy retirement

## Four checkpoints
1. **Parity audit.** Canonical desktop features: Generation controls city, district and defenses; Add controls property/building placement and landscape; Roads owns move, topology, conflict decisions, impacts and comparison. The property-first Inspector owns property, plot and building editing. Project and Layers stay in their existing menus.
2. **Retirement.** A desktop >=1000 CSS pixels now always uses the Generation/Add/Roads workspace. The public `?workspace=legacy` route is retired. Old UI roots stay in the DOM because the new dock reuses those exact domain controls and because narrow browser windows still need a compact fallback. Removing them entirely would break existing editors and is not deduplication.
3. **Regression migration.** New `scripts/g3g-desktop-parity-browser-qa.mjs` exercises the real new workspace in Chromium/Firefox at 1366x768, 1440x900 and 5120x1440. Specialist historical browser suites retain the narrow/compact UI via a test-only seam, not a public URL. They continue testing domain behavior and accepted-state safety.
4. **Release gate.** Full Node and browser CI, root/standalone byte parity, versioned HTML, and an unmerged review PR. G4 handles final broad release acceptance.

## Parity checklist
| Domain | Canonical desktop access | Preserved authority |
| --- | --- | --- |
| City, blocks, districts, defenses | Generation | Existing generation, identity and history systems |
| Rivers, lakes, coastlines, mountains | Add | Existing water/terrain draft sessions |
| Property creation and building placement | Add | E1, building placement sessions |
| Property, plot, building transforms and use | Property-first Inspector | E2-E4, F1-F4, scoped history |
| Road editing, impacts, compare | Roads | Road reflow, workers, independently validated Apply |
| Save/load/recovery, PNG, visibility | Project/Layers | Schema 9, portable format 1, file system |

## User experience since G2F
The familiar three-tab layout remains. Re-selecting a tab no longer clears its active preview. Old `?workspace=legacy` bookmarks can no longer reveal a separate competing desktop interface. The narrower browser fallback is intentionally retained. Existing independent history scopes and blocked-edit safeguards are unchanged.

## Deliberate deferrals
Issue #79 dead-end deletion, #44/#46 Large-city responsiveness, civic sites, 3D, schema migration, and G4 release acceptance. No tag or publication is authorized by G3G.

## Acceptance status
- [x] Audit and targeted desktop retirement
- [x] Modern-workspace browser test added
- [x] Final build and full CI verified in [G3G PR #84](https://github.com/xbwtyz/Mappo/pull/84)
- [x] Separate owner merge approval; G3G merged before G4
