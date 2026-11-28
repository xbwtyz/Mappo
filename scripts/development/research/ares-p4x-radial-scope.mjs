import {x7Recipe,x7Options} from './ares-p4x-x7-scope.mjs';
export const RADIAL_IDS=Object.freeze([
  "radial-small:eight-loop:50:y",
  "radial-small:eight-loop:100:x",
  "radial-small:eight-loop:75:y",
  "radial-small:five-branch:50:y",
  "radial-small:five-chain:50:y",
  "radial-small:eight-loop:100:y",
  "radial-small:five-branch:75:y",
  "radial-small:five-branch:100:y"
]);
const SMALL=Object.freeze(RADIAL_IDS.slice(0,3));
const SOURCE='82d75cb2bbf157e6c273f5acb8687908494b30d0073fc1b8078aa57afd60b3ed';
export function radialRecipe(caseId){
  if(typeof caseId!=='string'||!caseId.startsWith('g:')||!RADIAL_IDS.includes(caseId.slice(2)))throw Error('Unapproved radial research case.');
  const id=caseId.slice(2);
  if(SMALL.includes(id))return Object.freeze({id,source:SOURCE,cap:4,minimum:null,minimumRecipe:null});
  const r=x7Recipe(caseId);
  if(r.source!==SOURCE)throw Error('Radial source mismatch.');
  return Object.freeze({id,source:SOURCE,cap:r.minimum,minimum:r.minimum,minimumRecipe:r});
}
export function radialOptions(caseId){
  const r=radialRecipe(caseId);
  return r.minimumRecipe?x7Options(caseId):Object.freeze({mode:'adaptive',maxObjects:10000,maxHops:6,maxCandidates:256,maxNeighbors:4});
}
