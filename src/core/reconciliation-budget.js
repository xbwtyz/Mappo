export const LARE_LIMITS=Object.freeze({
  affectedParcels:256,parcelCandidates:24,buildingCandidates:24,
  beamWidth:8,stateExpansions:2048,work:1000000
});
export const LARE_STRATEGY_LIMITS = Object.freeze({
  ...LARE_LIMITS, work: 4000000, stateExpansions: 16384,
});
export class LareBudgetExceeded extends Error{
  constructor(resource){
    super('Local reconciliation exhausted its '+resource+' budget.');
    this.name='LareBudgetExceeded';this.code='lare-work-limit';this.resource=resource;
  }
}
// Share across the entire operation; elapsed time never selects geometry.
export function createLareBudget(limits=LARE_LIMITS){
  for(const k of ['work','stateExpansions'])
    if(!Number.isSafeInteger(limits[k])||limits[k]<1||limits[k]>LARE_STRATEGY_LIMITS[k])
      throw Error('Invalid LARE '+k+' budget.');
  const cap={work:limits.work,stateExpansions:limits.stateExpansions};
  let work=0,expansions=0;
  const spend=(count=1)=>{
    if(!Number.isSafeInteger(count)||count<1)throw Error('LARE charge must be a positive integer.');
    if(count>cap.work-work)throw new LareBudgetExceeded('work');
    work+=count;
  };
  return Object.freeze({spend,expand(){
    if(expansions>=cap.stateExpansions)throw new LareBudgetExceeded('stateExpansions');
    spend();expansions++;
  },snapshot:()=>Object.freeze({work,expansions,remainingWork:cap.work-work,
    remainingExpansions:cap.stateExpansions-expansions})});
}
