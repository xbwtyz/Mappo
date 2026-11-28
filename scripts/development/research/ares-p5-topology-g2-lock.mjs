import {radialRecipe} from './ares-p4x-radial-scope.mjs';
import {residualSeeds} from './ares-p4x-residual.mjs';
// G2 freezes one qualified G1 arm per scenario, with no caller-selected
// arm, coordinates, city, movement allowance or fallback.
export const G2_CASES=Object.freeze({
  'g:radial-small:eight-loop:100:x':'prior',
  'g:radial-small:eight-loop:75:y':'radial',
  'g:radial-small:five-chain:50:y':'prior'
});
export function g2Seed(caseId){
  if(typeof caseId!=='string'||!Object.hasOwn(G2_CASES,caseId))throw Error('Frozen P5 G2 case required.');
  const recipe=radialRecipe(caseId),matches=residualSeeds(caseId).filter(s=>s.arm===G2_CASES[caseId]);
  if(matches.length!==1)throw Error('G2 seed lock mismatch.');
  return {recipe,seed:matches[0]};
}
