import { riFreeze } from './road-impact-model.js';

export const LARE_STRATEGIES = riFreeze({
  direct: {
    id: 'direct', version: 1, operation: 'translate-road-group',
    requires: [], budget: 'impact',
  },
  strict: {
    id: 'strict', version: 1, operation: 'translate-road-group',
    requires: ['adaptGeneratedParcels'], budget: 'impact',
  },
  'selective-adaptive': {
    id: 'selective-adaptive', version: 1, operation: 'translate-road-group',
    requires: ['adaptGeneratedParcels', 'moveGeneratedBuildings'], budget: 'adaptive',
  },
  'enhanced-adaptive': {
    id: 'enhanced-adaptive', version: 1, operation: 'translate-road-group',
    requires: ['adaptGeneratedParcels', 'moveGeneratedBuildings'], budget: 'adaptive',
  },
  demolition: {
    id: 'demolition', version: 1, operation: 'translate-road-group',
    requires: ['demolishBuildings'], budget: 'demolition',
  },
});

export function* iterateLareStrategies(operation, strategies) {
  let result = null;
  for (const id of operation.strategies) {
    const strategy = LARE_STRATEGIES[id];
    const implementation = Object.hasOwn(strategies, id) ? strategies[id] : null;
    if (!strategy || strategy.operation !== operation.type || !implementation ||
        !strategy.requires.every(capability => operation.permissions[capability] === true) ||
        !implementation.canRun(result)) continue;
    // The operation owns finalization. A strategy receives the existing
    // candidate or refusal and reports its proposed result.
    const next = yield* implementation.run(result);
    if (!result?.lare?.source || !result.candidateProject || next?.candidateProject) result = next;
  }
  return result;
}
