# Mappo 0.2B / B5 — Expansion feasibility and stabilization

**Branch:** `feature/mappo-0-2b-b5-hardening`  
**Base:** merged B4, main at `87731a83c9d90f16f5b6fb6238c6beee7344450a`  
**Status:** B5 stabilization candidate under CI; no merge approved.

## Preservation-first scope

B5 is the final hardening and bounded-operation decision gate for 0.2B. The supported accepted operation is a move of one ordinary junction with an unambiguous block/face match and independently validated parcel/plot relationships. Other moves cannot silently bypass B4.

1. Establish developed-city fixture coverage across different settlement morphologies. Fail closed on unsupported buildings/frontages/access.
2. Exercise true accepted-state persistence: B4 Apply, format-1/schema-9 encode/decode, reopen equivalent project, and exact history reversibility.
3. Exercise rejection and cancellation without touching accepted data or revision. Explicit stale preview/project guards, cross-mode changes, and protected geometry.
4. Verify browser/viewport parity and visible disabled Apply; manual physical touch and assistive-technology checks remain open.
5. Assess each potential operation independently:
   - **Bounded segment translation:** requires proof for *both* endpoints, face identities and every dependent plot. Not enabled by the current one-junction commit API.
   - **Create edge:** requires deterministic collision-free IDs and no unhandled face splits or ownership migration. Deferred until separately validated.
   - **Remove edge:** requires no dependent block merge or property ownership ambiguity. Deferred until separately validated.
   - **Change road classification:** requires protected flags/infrastructure references to remain valid. Deferred until separately validated.
6. Keep schema 9, property-first selection, standalone HTML build reproducibility, and preservation of all unknown/opaque metadata.

## Exit and merge gates

- Actual full Node suite and Chromium/Firefox browser matrix green.
- Reviewed accepted developed-city movement or explicit evidence explaining the supported subset (do not fabricate a successful fixture).
- No unrelated state/history/recovery mutations on failed edits.
- Exact offline distribution/root HTML parity once any shipped source/version changes.
- No B5 merge until user approval. If a new operation fails preservation proof, retain inspection-only and move that operation to 0.2C.

## QA and delivery

The B5 implementation ships hardened regression coverage and a versioned offline HTML. Expanded segment, edge insertion/removal and reclassification operations remain deliberately unsupported until separate identity/ownership proofs exist. This is an explicit B5 scope-gate result, not a claim that the 0.2C editor already exists.

## First stabilization pass

Add targeted reproducible developed-city and portable-persistence regression tests without changing runtime behavior. The B5 standalone candidate is `0.2-dev.b5`; B4 remains the merged baseline until B5 receives final approval.
