import { LARE_PRESERVATION_LIMITS, LARE_STRATEGY_LIMITS } from './reconciliation-budget.js';
import { riCompare, riFreeze } from './road-impact-model.js';

export function createLareRoadOperation(project, draft, analysis, choices, acceptedRevision = null, strategy = 'progressive') {
  if (!['progressive', 'selective-adaptive', 'enhanced-adaptive'].includes(strategy))
    throw Error('Unknown preservation strategy.');
  const affectedBlocks = analysis.identity.changed
    .filter(face => face.kind === 'block')
    .map(face => face.id)
    .sort(riCompare);
  const dependencies = analysis.impact.issues
    .filter(issue => issue.kind !== 'road' && issue.kind !== 'junction')
    .map(issue => ({ kind: issue.kind, id: issue.id, code: issue.code }));
  const adaptive = strategy === 'progressive'
    ? ['selective-adaptive', 'enhanced-adaptive'] : [strategy];
  // Only copy plain data so that a future worker can receive the intent
  // without editor state, mutable choice maps or the accepted city object.
  return riFreeze({
    type: 'translate-road-group',
    accepted: { projectId: project.id ?? project.city.id, revision: acceptedRevision },
    editedIds: draft.selectedRoadIds.slice(),
    geometry: { offset: { ...draft.offset }, junctions: draft.proposedNodes.map(node => ({ ...node })) },
    affected: { roads: draft.changedRoadIds.slice(), blocks: affectedBlocks, dependencies },
    permissions: {
      parcelChoices: [...choices].sort(([a], [b]) => riCompare(a, b))
        .map(([id, choice]) => [id, structuredClone(choice)]),
      adaptGeneratedParcels: true,
      moveGeneratedBuildings: true,
      demolishBuildings: false,
    },
    strategies: ['direct', 'strict', ...adaptive],
    limits: {
      ...LARE_STRATEGY_LIMITS,
      total: strategy === 'progressive' ? LARE_PRESERVATION_LIMITS : LARE_STRATEGY_LIMITS,
    },
  });
}
