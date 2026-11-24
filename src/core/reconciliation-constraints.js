import { verifyLareRigidGeometry } from './reconciliation-buildings.js';
import { verifyLarePlotDeformation } from './reconciliation-plots.js';
import { iterateRoadGroupPreservationB1 } from './road-group-preservation-b1.js';
import { iterateRoadDependencies, inspectRoadContextReferences } from './road-impact-dependencies.js';
import { iterateStoredProjectValidation } from '../data/project-validation.js';

// Shared descriptions for the finalization pipeline and future diagnostics.
// Each check keeps the signature and acceptance semantics of its validator.
export const LARE_CONSTRAINTS = Object.freeze({
  identity: Object.freeze({
    kinds: Object.freeze(['ownership', 'protection', 'connectivity']),
    iterate: iterateRoadGroupPreservationB1,
  }),
  plots: Object.freeze({
    kinds: Object.freeze(['containment', 'separation', 'ownership']),
    check: verifyLarePlotDeformation,
  }),
  rigidBuilding: Object.freeze({
    kinds: Object.freeze(['rigidity']),
    check: verifyLareRigidGeometry,
  }),
  landDependencies: Object.freeze({
    kinds: Object.freeze(['containment', 'separation', 'attachment']),
    iterate: iterateRoadDependencies,
  }),
  infrastructure: Object.freeze({
    kinds: Object.freeze(['connectivity', 'attachment', 'protection']),
    check: inspectRoadContextReferences,
  }),
  storedProject: Object.freeze({
    kinds: Object.freeze(['containment', 'separation', 'ownership', 'connectivity', 'attachment']),
    iterate: iterateStoredProjectValidation,
  }),
});
