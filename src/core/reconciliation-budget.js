export const LARE_LIMITS=Object.freeze({
  affectedParcels:256,parcelCandidates:24,buildingCandidates:24,
  beamWidth:8,stateExpansions:2048,work:1000000
});
export const LARE_STRATEGY_LIMITS = Object.freeze({
  ...LARE_LIMITS, work: 4000000, stateExpansions: 16384,
});
export const LARE_PRESERVATION_LIMITS = Object.freeze({ work: 8000000, stateExpansions: 32768 });
export const LARE_DEMOLITION_LIMITS = Object.freeze({
  work: 32000000, stateExpansions: 131072, subsets: 16, depth: 8, deeperDepth: 16,
});
export class LareBudgetExceeded extends Error{
  constructor(resource){
    super('Local reconciliation exhausted its '+resource+' budget.');
    this.name='LareBudgetExceeded';this.code='lare-work-limit';this.resource=resource;
  }
}
// Share across the entire operation; elapsed time never selects geometry.
export function createLareBudget(limits = LARE_LIMITS, { parent = null, ceiling = LARE_STRATEGY_LIMITS } = {}) {
  for (const key of ['work', 'stateExpansions']) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ceiling[key])
      throw Error('Invalid LARE ' + key + ' budget.');
  }
  const cap = { work: limits.work, stateExpansions: limits.stateExpansions };
  let work = 0, expansions = 0;
  const checkWork = count => {
    if (!Number.isSafeInteger(count) || count < 1) throw Error('LARE charge must be a positive integer.');
    if (count > cap.work - work) throw new LareBudgetExceeded('work');
  };
  return Object.freeze({
    spend(count = 1) {
      checkWork(count);
      parent?.spend(count);
      work += count;
    },
    expand() {
      if (expansions >= cap.stateExpansions) throw new LareBudgetExceeded('stateExpansions');
      checkWork(1);
      parent?.expand();
      work++;
      expansions++;
    },
    snapshot: () => Object.freeze({
      work, expansions, remainingWork: cap.work - work, remainingExpansions: cap.stateExpansions - expansions,
    }),
  });
}
