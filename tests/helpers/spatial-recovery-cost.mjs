// Research-only policy/score separation; no production authorization.
export const retirementCounts=sets=>Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.length]));
export function countNonincrease(next,previous){
  return Object.keys(previous).every(k=>next[k]<=previous[k]);
}
export function recoveryCost(witness,areaOf){
  const counts=retirementCounts(witness.sets);
  const demolishedArea=witness.sets.buildings.reduce((n,id)=>n+areaOf(id),0);
  const scaledArea=witness.scaled.reduce((n,b)=>n+b.areaLoss,0);
  return {...counts,demolishedArea,scaledArea,footprintLoss:demolishedArea+scaledArea,
    switches:witness.switched.length,scaled:witness.scaled.length};
}
// Owner priorities interpreted for this experiment only. The cost is a
// vector, not a weighted universal scalar; retain exact policy-independent
// metrics so alternate decision policies can be tested later.
export function improves(next,previous){
  if(!countNonincrease(next,previous.counts??retirementCountsFromCost(previous)))return false;
  const keys=['properties','buildings','plots'];
  if(keys.some(k=>next[k]<previous[k]))return true;
  if(next.footprintLoss<previous.footprintLoss-1e-6)return true;
  if(next.footprintLoss>previous.footprintLoss+1e-6)return false;
  if(next.switches!==previous.switches)return next.switches<previous.switches;
  return next.scaled<previous.scaled;
}
function retirementCountsFromCost(c){return {properties:c.properties,plots:c.plots,buildings:c.buildings};}
