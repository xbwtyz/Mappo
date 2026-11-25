# Mappo — Development Rules and AI Communication Policy

> **Owner-approved policy**, effective once the documentation PR is separately approved and merged. Companion to [AGENTS.md](../../AGENTS.md). **Owner selections:** 48 of 51 development rules ON; 3 OFF. 41 of 48 output rules ON; 7 OFF. **Reporting mode: Adaptive.**

## 0. Scope, authority and interpretation

- **Project:** Mappo (`xbwtyz/Mappo`), a modular, offline-first 2D fantasy city generator/editor with a single-file HTML distribution. The released baseline as of this draft is [v0.2.0](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0).
- **Source of preferences:** owner-approved checklists and the owner's subsequent decisions, including legacy-save support OFF and Adaptive output structure. These are **working choices**, not evidence that the checked-in application or CI already reflects them.
- **Hierarchy:** applicable platform/tool requirements and explicit task-specific authorization prevail; this policy governs default Mappo work within those bounds. For design decisions not addressed here, consult the owner rather than inventing blanket authorization.
- **ON** means follow the rule for its *relevant scope*, not mechanically in every reply. **OFF** means the behavior is not a standing requirement; it does not order removal of existing features/tests or forbid one-off requested use.
- **Repository state:** inspect current source, workflows, PRs and CI before claiming an action or status. Some older planning documents are time-stamped and can be stale. Preserve historical descriptions as historical context rather than accepting them as authoritative current release state.
- **Approval boundary:** the policy adoption authorizes only this documentation PR. Future runtime changes, schema/CI updates, PR merges, releases and Pages deployments still need their own explicit approvals.

## 1. Development preferences — complete owner selection (51 rules)

The table preserves every item in the original development checklist, with the owner's single subsequent change to legacy-save compatibility reflected as **OFF**. The other two defaults that were already OFF remain OFF.

### Workflow and approvals

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `DEV-01` | **ON** | Discuss changes before writing code | Consult the owner before implementing new features or materially changing an established workflow. Answer investigation-only requests without code changes. |
| `DEV-02` | **ON** | Approve the plan and scope before implementation | Agree on the intended result, boundaries, trade-offs, and acceptance criteria before a new feature implementation. |
| `DEV-03` | **ON** | Keep analysis-only requests read-only | Do not commit, change issues, create branches, or alter code when asked only to analyze, explain, plan, or draft. |
| `DEV-04` | **ON** | Create a fresh branch from current main | Use a new feature/fix branch based on the verified current main for substantial development; do not work directly on main. |
| `DEV-05` | **ON** | Use focused pull requests | Make reviewable PRs with a defined goal and clear scope; group related changes without creating unnecessary PRs. |
| `DEV-06` | **ON** | Require explicit approval before merging | Never interpret a green test run, a plan approval, or a request to continue as implicit permission to merge. A direct instruction to merge the identified PR is approval. |
| `DEV-07` | **ON** | Prefer one consolidated development commit | Where practical, group an approved pass into one coherent commit rather than making tiny commits for each substep; add corrections when necessary. |
| `DEV-08` | **ON** | Report user-experience changes after each update | At the end of an implementation pass, explain what the end user can now do, what changed, and what is still limited; say explicitly if there were no user-facing changes. |

### Architecture and code design

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `DEV-09` | **ON** | Keep the codebase modular and expandable | Respect core/generators/data/editor/renderer/ui/worker boundaries; make new functionality extensible, including eventual 3D integration. |
| `DEV-10` | **ON** | Reuse functionality; avoid redundancy | Prefer existing data models, validators, UI sessions, helpers and histories; justify genuinely new abstractions instead of duplicating them. |
| `DEV-11` | **ON** | Modify authoritative source, not compiled HTML | Edit src/, styles/, templates and build tooling as appropriate; generate root index.html and dist HTML through the build instead of hand-editing output. |
| `DEV-12` | **ON** | Retain a self-contained offline HTML app | Do not add production runtime network dependencies, required CDNs or a mandatory server; maintain a working portable single-file distribution. |
| `DEV-13` | **ON** | Require deterministic builds and version parity | Keep src/core/version.js APP_VERSION and package.json aligned; compile root index.html byte-identically with dist/mappo-<APP_VERSION>.html. |
| `DEV-14` | **ON** | Prepare for 3D without replacing the 2D editor | Preserve the validated accepted 2D city as source of truth; prefer a derived 3D scene/viewer over an independent duplicated city editor. |

### City editing and integrity

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `DEV-15` | **ON** | Preserve deterministic generation | Keep seeded creation repeatable for the same version and options; intentional algorithm changes should be versioned and tested. |
| `DEV-16` | **ON** | Keep previews separate from accepted city data | Drafts, drag gestures, previews, Reset and Cancel must not silently mutate the authoritative accepted city. |
| `DEV-17` | **ON** | Validate independently before Apply | Recheck topology, dependencies, stale revisions, identity and full-project validity immediately before acceptance—not merely preview validity. |
| `DEV-18` | **ON** | Use atomic, reversible edits | Commit an accepted operation as one coherent transaction with the appropriate scoped Undo/Redo; failed application must not partially mutate accepted state. |
| `DEV-19` | **ON** | Preserve identities and authored information | Protect continuing entity IDs, names, uses, footprints, plot/frontage relationships and compatible unknown metadata from incidental replacement. |
| `DEV-20` | **ON** | Protect existing infrastructure | Never silently damage or reassign bridges, shorelines, passes, protected streets, districts, fortifications or other dependent structures. |
| `DEV-21` | **ON** | Prefer controlled local adaptation | When editing roads or properties, reconcile only affected generated geometry where safe; avoid gratuitous full-city regeneration. |
| `DEV-22` | **ON** | Show conflicts; never silently destroy custom work | Display concrete blockers and affected records; require an explicit, reviewed decision for potentially destructive replacement. |

### Save formats, recovery and archives

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `DEV-23` | **ON** | Keep schema 9 unless a new schema decision is approved | A change to the accepted data representation requires a separate schema/format design, validation plan and owner approval. This does not mandate compatibility with every older save. |
| `DEV-24` | **OFF** | Maintain backwards compatibility with older saves | Future versions need not import every old Mappo schema. Do not delete already-shipped migrations or fixtures solely because this requirement is OFF; propose a deliberate support policy for any incompatible change. |
| `DEV-25` | **ON** | Preserve compatible unknown fields | Round-trip supported extension and metadata fields without silently stripping them; explicitly document any incompatible new-format policy. |
| `DEV-26` | **ON** | Reject invalid or unsupported projects safely | Malformed or unsupported saves must fail clearly, without executing file content or destroying the currently accepted project. |
| `DEV-27` | **ON** | Maintain browser recovery and portable saves | Keep explicit latest/previous recovery and downloadable .mappo.json backups; recovery is not a substitute for portable backups. |
| `DEV-28` | **ON** | Retain historical distributions and fixtures | Preserve archived dist HTML, frozen test fixtures and the pre-3G archival ref unless an owner-approved filename-specific archival plan changes the policy. |

### UX and supported platforms

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `DEV-29` | **ON** | Prioritize desktop/laptop and ultrawide interfaces | Design and test for supported desktop browser viewports; phone and tablet polish is not a standing target. |
| `DEV-30` | **ON** | Support Firefox and Chromium | Verify meaningful browser behavior in both engines; do not substitute one browser's success for the other. |
| `DEV-31` | **ON** | Keep Generation, Add and Roads canonical | Reuse the three-tab desktop workspace unless a new information architecture is deliberately approved. |
| `DEV-32` | **ON** | Use map-centered, property-first Inspector | Keep relevant selected-object facts, context and actions together; preserve map context during editing. |
| `DEV-33` | **ON** | Support mouse, trackpad, keyboard and precise numeric controls | Maintain accessible focus and shortcuts, pan/zoom behavior, direct handles, and precise edit controls in supported desktop browsers. |
| `DEV-34` | **ON** | No forced walkthroughs, onboarding or wizards | Do not add mandatory tutorials, step-by-step onboarding, or artificial confirmation flows. Necessary explicit acceptance of destructive changes is not a tutorial. |
| `DEV-35` | **ON** | Favor compact, understandable UI | Avoid redundant controls, duplicate panels, unnecessary whitespace, raw technical clutter and repetitive instructions. |
| `DEV-36` | **ON** | Keep competitor names out of shipped builds | Competitor comparisons are allowed in private planning, but do not embed competitor naming or branding into user-facing Mappo builds. |

### Testing, performance and CI

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `DEV-37` | **ON** | Use targeted tests during development | Run focused tests to reproduce and fix changes; do not rerun the full suite at every small edit. |
| `DEV-38` | **ON** | Run full CI on review-ready PRs and main | Use the required comprehensive CI gate before merge/release and after merging; `[full-ci]` / `[full-ci-benchmark]` may request draft qualification but cannot replace review-ready and exact-main gates. Do not treat a narrow smoke test as equivalent. |
| `DEV-39` | **ON** | Keep six-runner parallel CI | Maintain two Node shards plus desktop/roads/property/integration browser suites and the required aggregate result unless a reviewed CI change is approved. |
| `DEV-40` | **ON** | Require green CI for the exact review-ready revision | Verify check results match the candidate SHA; later commits require revalidation under the policy. |
| `DEV-41` | **ON** | Test standalone and offline behavior | Include deterministic output checks, actual standalone file:// startup, and isolation from required network access. |
| `DEV-42` | **ON** | Retain old-save and cross-editor regression coverage | Keep already-existing frozen fixtures and relevant regression coverage. Under the separate legacy-compatibility OFF rule, new format support and test expectations may change only by an approved plan; never silently bypass required CI. |
| `DEV-43` | **OFF** | Run phone and tablet QA | Routine phone/tablet acceptance is outside the current desktop support target. Do not delete historical test assets merely because this default is OFF. |
| `DEV-44` | **OFF** | Run heavy C7 benchmark on every PR | Keep heavyweight performance benchmarking explicitly opt-in via manual dispatch, `[full-ci-benchmark]` on the current PR head, or focused `[benchmark-c7]` on an ordinary draft head; focused `[benchmark-f4]` may select the existing building benchmark without full CI; retain ordinary road correctness and relevant performance regressions. |

### Releases, documentation and project management

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `DEV-45` | **ON** | Verify post-merge CI before releasing | Check the required main-branch CI result on the exact intended release commit. |
| `DEV-46` | **ON** | Require separate release authorization | Approval to plan, code, open a PR or merge is not authorization to publish a tag, release or website. |
| `DEV-47` | **ON** | Keep GitHub Release publication manual and guarded | Retain explicit owner-triggered publishing with correct version, artifact, release notes, tested SHA and no tag overwrite. Update version-specific workflow parameters when planning a new release. |
| `DEV-48` | **ON** | Publish GitHub Pages separately | Do not deploy Pages on merge or GitHub Release by implication; require separate owner authorization. |
| `DEV-49` | **ON** | Include release notes and known limitations | For releases, document user value, compatibility policy, migration/upgrade instructions, known restrictions and release verification. |
| `DEV-50` | **ON** | Update relevant plans and documentation | Keep current roadmaps, user/developer docs, acceptance records and architecture notes accurate when work changes them; preserve historical plans as historical evidence. |
| `DEV-51` | **ON** | Track meaningful issues, not just benchmarks | Create or close issues for reproducible problems and real user value, cite evidence, and avoid optimization without a meaningful problem statement. |

## 2. Output and communication preferences — complete owner selection (48 rules)

The table preserves each item in the communication checklist exactly by intent, including the seven explicitly disabled defaults.

### Overall response structure

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-01` | **ON** | Start with a concise summary | Lead with the main outcome in about one to three sentences. |
| `OUT-02` | **ON** | Show development status near the top | Use accurate statuses such as planning, implementing, CI running, ready for approval, merged, released or blocked. |
| `OUT-03` | **ON** | Use consistent section headings | Keep a predictable structure for substantial reports; omit irrelevant sections under Adaptive mode. |
| `OUT-04` | **ON** | Show a compact change table | Use a small table for meaningful changes, not for simple answers or status-only replies. |
| `OUT-05` | **OFF** | Always include an executive summary box | A separate highlighted summary container is not required; ordinary summary prose is preferred. |
| `OUT-06` | **ON** | Keep routine updates concise | Prioritize useful facts and avoid excessive detail for routine development passes. |

### Before development begins

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-07` | **ON** | Explain the problem and intended outcome | State what is wrong, missing or desired and how success will look. |
| `OUT-08` | **ON** | Outline the implementation approach | Give the substantive planned steps and affected systems before implementing approved feature work. |
| `OUT-09` | **ON** | Highlight architectural implications | Call out new modules, model changes, schema changes, migrations, integration points or reused subsystems where material. |
| `OUT-10` | **ON** | Present decisions with recommended defaults | Explain real choices and recommend sensible defaults; do not invent choices where none are needed. |
| `OUT-11` | **ON** | Provide effort and complexity estimates | Use qualitative Low/Medium/High complexity with rationale/uncertainty; do not promise precise future delivery times. |
| `OUT-12` | **ON** | Show acceptance criteria before coding | Define reviewable outcomes and relevant verification gates before an implementation pass. |

### After a development update

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-13` | **ON** | Explain exactly what was implemented | Separate completed code and verified behavior from proposals, incomplete work or future ideas. |
| `OUT-14` | **ON** | Include a user-experience change breakdown | Explain differences to user workflows; write 'No user-facing changes' when accurate. |
| `OUT-15` | **ON** | Include important technical changes | Mention relevant engine, UI, data, architecture and build changes without dumping a full file tree. |
| `OUT-16` | **OFF** | List every modified file | Not a routine requirement; include files when requested or necessary to diagnose/review a change. |
| `OUT-17` | **ON** | Show before-and-after comparisons | Provide a concise comparison when there is a real observable difference; never invent a baseline. |
| `OUT-18` | **ON** | Identify limitations and incomplete scope | List outstanding known issues, regressions, blockers or intentionally deferred functionality relevant to the task. |
| `OUT-19` | **OFF** | Include screenshots for visual changes | Screenshots are not automatically required; include authentic screenshots only when requested or materially necessary to verify a visual claim. |

### Testing, CI and verification

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-20` | **ON** | Report test outcomes and totals | Report verified passed/failed/skipped totals where available and relevant; if no tests ran, say so. |
| `OUT-21` | **ON** | Link to GitHub Actions CI runs | Provide the actual verified run URL whenever citing a GitHub Actions result. |
| `OUT-22` | **ON** | Show CI duration | Include the measured total run duration when available; never guess durations. |
| `OUT-23` | **ON** | Explain failures and resolutions | State what failed, likely/verified cause, what changed, and the status of the final rerun. |
| `OUT-24` | **ON** | Include performance comparisons | Include measured before/after figures only if relevant, comparable and correctly scoped to test conditions. |
| `OUT-25` | **ON** | Distinguish automated from manual testing | Do not claim hands-on user verification based only on scripted tests or the reverse. |

### GitHub and development tracking

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-26` | **ON** | Always link the relevant PR | When a PR exists and is relevant, include its number and URL; do not invent PR links. |
| `OUT-27` | **OFF** | Report branch and commit identifiers | Not routine output; disclose the exact branch/SHA when needed for review, debugging or release evidence. |
| `OUT-28` | **ON** | Clearly state merge and release status | Distinguish branch changes, merged code, published release and Pages deployment; no implied success. |
| `OUT-29` | **ON** | Mention affected GitHub issues | Link relevant issues opened, addressed, closed or deferred; do not pad updates with unrelated issues. |
| `OUT-30` | **ON** | Summarize CI failures without raw log dumps | Surface critical error, cause and resolution; link raw logs rather than pasting them wholesale. |

### Planning and future recommendations

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-31` | **ON** | End with the next recommended action | Provide one specific next action when follow-on work exists; respect approval boundaries. |
| `OUT-32` | **ON** | Explain the benefit of recommendations | Connect recommended work to user value, correctness, reliability or maintainability. |
| `OUT-33` | **ON** | Distinguish necessary work from optional ideas | Separate prerequisites and blockers from enhancements or experiments. |
| `OUT-34` | **ON** | Present trade-offs and risks | Describe material costs, constraints and possible downsides, not just benefits. |
| `OUT-35` | **OFF** | Include a priority-ranked roadmap | Only provide a detailed ranked roadmap when the user asks for planning or the milestone requires one. |
| `OUT-36` | **OFF** | Suggest new features during routine updates | Do not add speculative features after routine work; stay focused on the current approved goal. |

### Communication style

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-37` | **ON** | Use a friendly, conversational tone | Be collaborative and professional without hiding uncertainty or patronizing the owner. |
| `OUT-38` | **ON** | Use occasional emojis and status icons | Use a few meaningful cues, not visual clutter. |
| `OUT-39` | **ON** | Explain technical concepts in plain English | Explain consequences before internal details when possible; keep technical terms accurate. |
| `OUT-40` | **ON** | Offer deeper technical details on request | Be concise by default; go deep on code, tests or architecture when asked. |
| `OUT-41` | **ON** | Avoid repeating prior development history | Reference earlier work only when needed to understand current changes or comparisons. |
| `OUT-42` | **ON** | Avoid excessive progress narration | Provide meaningful milestone and blocker updates, not repeated empty status notices. |

### Special reports and artifacts

| ID | Status | Rule | Operational meaning |
|---|---|---|---|
| `OUT-43` | **ON** | Use tables for milestone comparisons | Compare original goals vs. delivered, partial, deferred and remaining scope when reviewing milestones. |
| `OUT-44` | **ON** | Provide diagrams for architecture changes | Use diagrams when meaningful data flow or component relationships change; don't force them for small edits. |
| `OUT-45` | **ON** | Offer visual mockups for UI changes | Offer appropriate UI mockups when design choices warrant a visual before implementation. |
| `OUT-46` | **ON** | Use graphs when comparing measured performance | Graph sufficient comparable data when useful; never imply metrics that weren't measured. |
| `OUT-47` | **ON** | Produce formal acceptance reports | Create repository acceptance records for major milestones and releases, not for every tiny commit. |
| `OUT-48` | **OFF** | Create a changelog entry after every PR | Maintain milestone/release notes rather than a separate user-facing changelog for each PR. |

## 3. Adaptive reporting mode — approved

**Principle:** Include all relevant facts, but do not add empty headings, compulsory boxes, repeated history or unnecessary status narration. Requirements phrased “always” are **contextual** (for example, link the PR *if a PR exists*). Report lack of evidence plainly.

### 3.1 Simple factual questions and status checks

Answer the actual question first, directly. Add a relevant PR, run or release link if it helps. Do not inflate simple answers into a milestone report. Do not guess the current state; inspect it when necessary. If the only verified information is “CI in progress,” say so rather than implying success.

### 3.2 Pre-development proposal (substantial feature/change)

1. **Summary and status:** planning/not approved yet.
2. **Problem and desired user outcome:** what the user will be able to do.
3. **Approach:** steps, affected subsystems, reuse vs. new modules, schema/data implications.
4. **Trade-offs and meaningful decisions:** recommended defaults; skip invented or trivial choices.
5. **Complexity:** Low/Medium/High with rationale/uncertainty; no firm future delivery time promises.
6. **Acceptance criteria:** specific functional, non-destructive, save and test/release gates.
7. **Approval boundary:** explain exactly which action needs owner approval.

Use a compact table if it clarifies substantive alternatives. A visual mockup is appropriate for significant interface choices; a diagram is appropriate for significant architecture changes.

### 3.3 Completed implementation pass

1. **Status + concise summary:** what was completed and on which side of PR/CI/merge gates it sits.
2. **Compact change table:** feature/system versus actual change, if substantial.
3. **User experience:** before/after behavior and practical benefit; say **“No user-facing changes”** for infrastructure-only work.
4. **Technical implications:** important modules, algorithms, version/schema effects; no forced complete file listing.
5. **Verification:** relevant Node/browser totals, verified pass/fail/skipped counts, exact GitHub Actions link, measured CI duration if available; automated is not manual testing.
6. **Known limitations/issues:** link relevant GitHub issues, distinguish blockers from deferred work, summarize failures and fixes without raw log dumps.
7. **Next recommended action:** one clear appropriate follow-up, including permission needed. Do not speculate about unrelated features.

Sections are conditional. For example, no performance section without relevant comparable measurements; no CI duration if no run occurred; no performance graph without enough real comparable data. Do not overstate the impact of a test fixture or automation as hands-on device QA.

### 3.4 Merge and release confirmation

- Verify the merge/release/Pages outcome via the provider; clearly separate **PR merged**, **main CI green**, **release tagged/published**, **asset attached** and **Pages deployed**.
- Link to actual PR, run and release when they exist; mention tested version, delivered change and remaining gates.
- An approval for one step never grants the others. A previous CI success is not a substitute for the exact required candidate or main SHA. Exact hashes belong in acceptance evidence and can be shown when necessary even though routine SHA reporting is OFF.

### 3.5 Milestone, architecture and performance reports

- Compare original goals versus delivered, partial, deferred and missing items in a table when reviewing a milestone.
- For materially new system relationships, provide a readable component/data-flow diagram. For important UI choices, offer a mockup; **an optional design mockup is not the same as a mandatory implementation screenshot**.
- If performance is at issue, use repeatable fixtures and comparable metrics; graph a trend only when meaningful, never from invented or incomparable numbers.
- Create formal acceptance records for major milestone/release gates, not a changelog file for every PR.

### 3.6 Presentation style

Friendly, plain English, compact, precise, occasional emojis/status icons. Use stable headings where helpful but no compulsory executive-summary box. Avoid unnecessary history, raw CI dumps, status spam and speculative feature pitches in routine updates. Provide detailed diagnostics on request.

## 4. Technical guardrails, independent of the compatibility toggle

These are consequences of the ON development rules and current repository implementation, not separate blanket authorization to change the code.

### 4.1 Authoritative 2D city and transactions

- The accepted city is distinct from transient drafts, previews, inputs and validation results. Cancel, Reset, invalid input and stale drafts leave the accepted project unchanged.
- Editing must revalidate the actual candidate, road graph/faces, dependencies, ownership, linked records and protected infrastructure before a single atomic Apply. Preserve continuing IDs and user-authored data, or present a specific blocker or explicit replacement decision.
- Undo/Redo is currently **scoped** to editing domains, not a universal global timeline. Do not falsely promise global undo or silently interleave incompatible histories.
- For new geometry features (including connected dead ends and 3D), explicitly review their assumptions against existing road/parcel/building invariants; do not weaken validators just to make an edit pass.

### 4.2 Saves, schemas and backward compatibility OFF

- **Current 0.2.0 facts:** app version 0.2.0, project schema 9, portable container format 1 and workspace schema 1; v0.2.0 already supports reading historical schemas 1–8. Existing capabilities do not vanish because of a preference switch.
- **New owner decision:** **Maintaining compatibility with all older saves is NOT a requirement for future releases.** It is acceptable to *propose* a breaking change to improve architecture, but not to silently implement one.
- **Still ON:** (a) changes to schema 9 or format require a separate approved data-model decision; (b) invalid/newer unsupported saves must be rejected safely; (c) compatible unknown fields should survive supportable round-trips; (d) accepted user work must not be silently lost; (e) portable saves and browser recovery remain part of the supported experience.
- An approved breaking-change plan must explicitly state: which app/save versions remain supported; whether any migration or separate conversion tool will exist; how a user backs up before upgrading; how errors communicate unsupported saves; what fixtures/CI expectations legitimately change; and whether persistent format, project schema or workspace schema increments.
- **No automatic deletion:** retain existing migration functions and frozen historical fixtures until owner approves any planned modifications. Do not skip, disable, or mark a failing historical CI check successful. A compatibility test suite can be retired or scoped to an archived compatibility baseline only through reviewed test/CI changes and explicit approval.
- Loading a file must not run untrusted code or regenerate previously authored geometry from a seed as an unapproved migration shortcut.

### 4.3 Source, build and 3D boundary

- Keep module responsibilities: `src/core` shared model/geometry, `src/generators` generation, `src/data` persistence, `src/editor` sessions/transactions, `src/renderer` presentation, `src/ui` interaction, `src/worker` targeted background computation. Reuse existing helpers before adding overlapping engines.
- Edit source/stylesheet/template and regenerate: root `index.html` and the current `dist/mappo-<APP_VERSION>.html` must be byte-for-byte identical. Match `src/core/version.js` and `package.json`.
- Do not require runtime internet access or a server for the portable HTML; external packages are possible only if the resulting distribution stays self-contained and dependency policy is separately reviewed.
- Keep the accepted 2D geometry as the authoritative model for future 2.5D/3D scenes, with derived meshes rather than an uncoordinated second editing engine. Persisting new height/roof/terrain information is a separately designed model decision, not an automatic schema bump.

### 4.4 Historical artifacts and archiving

- Under the [Build Retention Policy](../maintenance/BUILD_RETENTION_POLICY.md), do not remove, overwrite or relocate historical standalone builds merely to reduce repository size, and preserve archived fixtures, known references and `archive/pre-3g-history`.
- A retention change needs a filename-by-filename assessment, external link/Pages/CI and fixture checks, reversibility, and **separate owner authorization**. “Legacy compatibility OFF” does **not** mean “archive retention OFF.”

### 4.5 CI, quality and support scope

- Local development: focused syntax/Node/browser tests on affected domains. Gate: full required CI on ready-for-review PRs and `main`, with **two Node shards, four browser suites and the combined `Build, Node tests and browser QA` result**.
- Check deterministic compiled parity, offline `file://`, supported browser engines, representative cross-editor/Undo/save/recovery behavior, and any new schema policy when changed. Test failures must be fixed or explicitly reviewed as policy changes; don't quietly disable checks.
- Desktop/laptop/ultrawide with mouse/trackpad/keyboard are the support targets; phone/tablet acceptance is OFF by default. Heavy C7 performance benchmarking is explicit opt-in (manual dispatch or approved head-commit markers). Focused draft benchmark jobs do not replace mandatory full review and main gates. Do not chase benchmarks absent a reproducible user-facing regression.
- The existing CI suite contains legacy-save tests despite optional future compatibility. **That is not an error in itself:** the shipped version must remain tested to its own published contract until an approved update changes supported behavior.

### 4.6 Release, Pages and approvals

- Feature plan approval → permission to implement agreed scope, **not** automatic merge. Green CI → evidence, **not** merge permission. Merge approval → permission for that particular PR, **not** tagging/release or Pages permission.
- A GitHub Release requires explicit release authorization, confirmed CI on the exact `main` SHA and the applicable verified release workflow; a separate manual action controls GitHub Pages. Never invent assets or claim successful tool execution without checking.
- The current release workflow is version-specific to **0.2.0**. Before a future release, propose a separate reviewed workflow/version update rather than assuming today's dispatch can publish any new version.
- Do not rewrite existing release tags, replace historical builds or circumvent protected GitHub workflow guards without explicit reviewed authorization.

## 5. Conflicts and precedence — approved interpretations

| Apparent conflict | Resolution |
|---|---|
| Full reporting vs. concise answers | **Adaptive:** substantive tasks receive relevant sections; trivial requests get direct answers, not boilerplate. |
| “Show compact change table” vs. a simple status | Use a table for meaningful implementations/comparisons, not for a one-line status. |
| “Show before/after” vs. an invisible infrastructure change | Say **No user-facing changes** and explain the technical benefit. |
| “Include performance comparisons” vs. no measurements | Only present real, comparable and relevant metrics; never guess. |
| “Provide architecture diagrams” vs. minor refactor | Diagrams for materially changed relationships, not every code cleanup. |
| “Mockups ON” and “screenshots OFF” | Offer design mockups for significant UI choices; don't automatically capture existing UI screenshots. |
| “Estimate effort” vs. uncertainty | Use relative complexity and risks, not time-to-delivery promises. |
| “Branch/SHA output OFF” vs. exact-SHA CI/release | Preserve exact identifiers in validation evidence; expose to the owner when needed, not in every routine message. |
| Acceptance reports ON and per-PR changelog OFF | Major milestone/release acceptance documentation remains, per-PR changelogs are not required. |
| Future legacy save compatibility OFF vs. current historical tests ON | Continue current working checks until a separately approved support/version/CI change; don't erase shipped behavior retroactively. |
| Existing migration contract says old schemas must migrate | Interpret it as the **existing 0.2.0 implementation contract**; future support policy can differ only by approved new-schema design, not by editing historical evidence. |
| Current user preference vs. older milestone document | New explicit owner-approved preferences direct future planning; existing checks/data protections and repository requirements remain until explicitly changed. |
| Existing version-specific 0.2.0 release workflow vs. future versions | Treat release guards as version-scoped; update and approve the next release workflow separately. |

## 6. Maintaining and reconciling these instructions

The owner approved these rules and authorized a **documentation-only PR**. The policy becomes authoritative once separately approved and merged; this does not grant blanket authorization for other changes.

1. Keep this as the detailed owner-selected ON/OFF catalog and the root `AGENTS.md` as its short entry point.
2. Current-facing guides should reflect the published [v0.2.0 release](https://github.com/xbwtyz/Mappo/releases/tag/v0.2.0). Historical H1–H5 acceptance reports continue to document their original review stage.
3. v0.2.0's supported schema 1–8 migrations remain implemented and tested. **Future** legacy compatibility is optional. Any reduction in supported formats requires separate data/CI design approval and safe rejection/backup guidance.
4. The release workflow is specifically for **v0.2.0**. A different version requires an approved new publisher configuration and independent release authorization.
5. Changing code, schema, CI selection, archival retention or Pages settings requires a separate proposal, passing tests and explicit owner approval. Never disable tests merely to implement a toggled preference.
6. Submit this documentation-only PR for review and **do not merge** without separate approval.

## 7. Supporting repository documents

- [Developer Guide](developer-guide.md)
- [Current CI Test Policy](ci-policy.md) and [CI overview](ci-guide.md)
- [Build Retention Policy](../maintenance/BUILD_RETENTION_POLICY.md)
- [Project Persistence Contract](../reference/PROJECT_FORMAT.md)
- [Road Editing Preservation Contract](../reference/road-edit-contract.md)
- [Desktop UX plan](../history/0.2/workspace/milestone-0-2g-desktop-ui.md)
- [Published v0.2.0 Release Notes](../releases/v0.2.0.md)

**Revision history:** owner-approved consolidation and documentation reconciliation, November 21, 2026. No runtime, schema, CI, release or Pages changes authorized.