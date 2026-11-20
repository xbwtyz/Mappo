# Mappo 0.2E / E3 — Feature acceptance report

> **Status (2026-11-20):** E3 is proposed for review in [PR #62](https://github.com/xbwtyz/Mappo/pull/62). The E3 design is approved and merged in [PR #61](https://github.com/xbwtyz/Mappo/pull/61). **Implementation is unmerged and unreleased.** The latest full CI result on the final feature branch must pass before an acceptance/merge recommendation.

## Implemented scope

- Start **Merge properties** in the existing Property Inspector; choose an adjoining site from a compatible-neighbor select or click its land on the map.
- Preview the original primary and resulting four-corner combined property without modifying accepted land.
- Eligibility requires two well-formed four-corner convex properties with a complete shared frontage-to-rear side, compatible verified frame, block, district, frontage road and tiling.
- Primary property retains its ID, name and custom identity. The secondary record is retired. A customized secondary requires an explicit checkbox; a copy of its complete identity record is stored in optional `propertyMergeHistoryE3` lineage.
- Preserve every existing plot and building ID, metadata and geometry; update verified plot/building parent references and surviving property's ordered memberships. Never physically move a structure.
- Invalid geometry, ownership ambiguity, incompatible roads, bad building access or unapproved protected identity is a blocker; Reset/Cancel never mutate city.
- Apply uses full project validation, portable format-1/schema-9 round-trip, stale project/revision guards and a whole-city history snapshot. Undo/Redo restores exact source state; load and regeneration invalidate session history.
- No schema migration; no separate global history or duplicate property editor. Version `0.2-dev.e3` compiled to `dist/mappo-0.2-dev.e3.html` and root `index.html`.

## Acceptance gates

| Check | Evidence | Gate |
| --- | --- | --- |
| E3-A eligibility, preview and nonmutating choices | `src/core/property-merge-geometry-e3.js`, Inspector/map controls | Full browser QA required |
| E3-B lineage/identity and exact plot IDs | `tests/property-merge-e3.test.js` | Focused model acceptance passed; CI pending final head |
| E3-C structure/plot ownership checks | Independent full validator, invalid-case tests | Review protected and legacy fixtures |
| E3-D atomic Apply and Undo/Redo | Model tests plus compiled browser suite | Full CI pending final head |
| E3-E Chromium/Firefox desktop/phone and byte-identical standalone | `scripts/property-merge-e3-browser-qa.mjs`, permanent Mappo CI | Green final-head CI required |

## Preservation and known limitations

- E3 deliberately does not perform arbitrary polygon unions, partial-side merges, cross-block/cross-road merges, physical changes to buildings, plot-count reduction or schema changes.
- Select a **primary** parcel first; its identity is retained. For customized secondary identity, authorizations must be explicit and the retired record is preserved in the lineage.
- Existing plots must form one exact frontage-to-rear strip sequence. Ambiguous legacy geometry blocks Apply rather than guessing or redrawing.
- Preview eligibility checks are lighter than the independent project validation performed at Apply. Full Node/browser suites are the authoritative acceptance gate.
- The new feature remains unmerged until owner approval and no release/publishing is authorized. E4 plot count is next, only after E3 acceptance.

## Check URLs

- [PR #62 checks](https://github.com/xbwtyz/Mappo/pull/62/checks)
- [PR #62 changes](https://github.com/xbwtyz/Mappo/pull/62/files)
