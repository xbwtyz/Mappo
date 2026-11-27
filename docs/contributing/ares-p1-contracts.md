# ARES P1 detached developer contracts

These APIs are internal, transient and detached. They are not a public plugin SDK, persistence format change, Apply token or a new editing authority. P1 is explicitly authorized; later phases remain held.

## Diagnostic APIs
- createAresDiagnosticContext: existing normalized SRE road-group operation plus session and source version; preserves exact offset, typed selection and explicit permission flags.
- createAresDiagnostic: structured reason/code/stage, source ID/version, typed refs, unresolved IDs, exact setback measurements and optional existing budget counters. Never infer global impossibility from refusal. Source-specific adapters map known codes and preserve ambiguous references without guessing.
- exportAresPreflightDiagnostic / replayAresPreflightDiagnostic: explicit confirmed local snapshot export and independent C1/B1 preflight rerun with source/context checks. Diagnostic file includes city data; never send automatically. Source/fingerprint/session strings are supplied by caller, not authentication. Not a full SRE search replay or mounted UI. See source tests for exact examples.

## Provider query seam
Register internal descriptors and synchronous evaluators through createAresConstraintQueryService (src/core/ares-constraint-query.js). Evaluators receive immutable query DTO and charge function backed by existing shared budget; no accepted-city object or write API. Production adapters must close over separately derived read-only snapshot/index data, account their actual work, and independently verify source references and geometry. Do not register arbitrary downloaded/user-executable code.

Example (detached synthetic only):

```js
const service = createAresConstraintQueryService([{
  descriptor: { id: 'synthetic-elevation', version: 1, capabilities: ['vertical-clearance'] },
  evaluate(query, spend) {
    spend(1);
    return [{
      id: 'example-clearance', ruleVersion: 'synthetic-1', kind: 'hard-domain',
      outcome: query.bounds.z === null ? 'unknown' : 'satisfied',
      refs: query.refs, anchorRefs: [], detail: 'Synthetic observation, not physical validation'
    }];
  }
}]);
// query includes normalized diagnostic context, source snapshot and geometry
// fingerprints, swept/final phase, explicit frame and X/Y ranges, optional Z.
const evidence = service.query('synthetic-elevation', query, existingBudget);
```

The example is deliberately not a real clearance algorithm. Missing vertical data stays null/unknown, never zero. A non-null Z range requires explicit units and datum; existing XY uses city-map-unit. Capability declaration is not permission. Distinguish hard-domain, protection, permission and soft preference evidence; hard violations block and unknown/unsupported hard evidence stays unresolved. Empty or preference-only responses do not count as a hard pass. An observed-satisfied summary is not independent verification or global feasibility. Provider errors, malformed rows, duplicates and shared budget exhaustion fail closed rather than emitting a partial pass. Evidence matching checks exact query, revision, source, geometry, permission, frame and phase, including signed zero; it does not authenticate fingerprints or know host freshness. No new root allowance.

P2 must derive genuine read-only providers for existing water/terrain/defense/road geometry and exact swept/final detection, bind authoritative fingerprints and compare indexed/reference results. P7–P8 must independently bind evidence to host revision, candidate and rule versions before publication. Synthetic vertical test evidence is separate from live support; no continuous elevation, tunnels, grade-separated topology or new schema.

## Qualification
Source tests exercise real existing preflight and graph/impact shapes, immutable DTOs, invalid inputs, signed zero, stale context, deterministic enumeration and synthetic vertical/provider cases. All modules remain detached from shipped editor/worker closures in P1. Existing full CI, SAFE-01–15 and separate merge/release gates remain mandatory.
