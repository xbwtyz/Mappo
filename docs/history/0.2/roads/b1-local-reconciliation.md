# 0.2B / B1 — Candidate topology foundation

Implementation branch: `feature/mappo-0-2b-b1-local-reconciliation`; baseline: merged A5 on main (`0790000`). Schema **9**, standalone **0.2-dev.b1**.

- `prepareRoadReconciliationB1(project, junctionId, point)` creates a detached, frozen *candidate-only* snapshot using A1 proposal, A2 face extraction and stable face matching.
- Unchanged and unambiguously matched blocks retain IDs and metadata. A2-updated block areas are placed in a candidate. Road record identities and unrelated record arrays are preserved.
- Inventory: moved junction, connected road IDs, changed block IDs, and block-dependent properties, plots, buildings, open spaces and district/defense records.
- Protected, invalid, ambiguous, split/merge, or incomplete candidate analysis yields explicit rejection with **no candidate**.
- B1 does not reconcile dependent property geometry, validate the final full project or permit Apply; `applyReady` is **always false**. B2–B4 implement those gates in later separately approved cycles.
- No accepted project mutations, persisted draft state, editing history, UI mode, or schema changes.
- Deliverables: modular source, new B1 focused tests, `index.html` and versioned `dist/mappo-0.2-dev.b1.html` with byte parity.

Verification and browser results are the GitHub PR's CI gate. No merge until owner approval.

## Post-review correction pass

- Reuse the complete A3 impact report for all changed-road dependencies, including nearby frontage, building access, wall/gate/tower clearance, and opaque data.
- Preserve typed `(kind,id)` issue identity and severities; distinguish `needs-review` ambiguous topology from geometrically `invalid` operations.
- Partition the candidate inventory into **modified with preserved identity**, **affected but not modified**, and **unchanged**; retain original A3 issue codes and related IDs.
- No incomplete A3 report can yield a candidate. `applyReady` remains `false`; the candidate is not accepted or persisted.
- Add B1-specific A3 parity, classification, road-collapse, seeded morphology, and custom extension tests. Keep the PR to one commit by replacing its original commit before merge.
