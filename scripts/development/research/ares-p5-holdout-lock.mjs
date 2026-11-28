import {readFileSync} from 'node:fs';
import {HOLDOUT_MANIFEST,holdoutRecipe} from './ares-p5-holdout-inventory.mjs';
import {G_MANIFEST} from './ares-p4-g-corpus.mjs';
import {riFreeze} from '../../../src/core/road-impact-model.js';
const frozen=new Map(),sources=new Set();
for(const morphology of HOLDOUT_MANIFEST.morphologies){
  const data=JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p5-holdout-lock-'+morphology+'.json',import.meta.url),'utf8'));
  if(data.run!==46097554296||data.attempt!==1||data.source!=='fc95f913c7fda5da78767617f603c7605b0fd065'||data.rows.length!==25)throw Error('Holdout inventory evidence identity changed.');
  for(const {job,row} of data.rows){
    const recipe=holdoutRecipe(row.id);
    if(!Number.isSafeInteger(job)||frozen.has(row.id)||sources.has(row.source)||!(/^[0-9a-f]{64}$/).test(row.source)||
      row.options.morphology!==morphology||JSON.stringify(recipe.options)!==JSON.stringify(row.options)||
      JSON.stringify(recipe.offset)!==JSON.stringify(row.offset)||recipe.preferredGroup!==row.preferredGroup||
      row.selection!=='selected'||!Array.isArray(row.selectedRoadIds)||row.selectedRoadIds.length<4||row.selectedRoadIds.length>8||
      new Set(row.selectedRoadIds).size!==row.selectedRoadIds.length)throw Error('Invalid holdout lock.');
    frozen.set(row.id,riFreeze(row));sources.add(row.source);
  }
}
if(frozen.size!==100)throw Error('Incomplete holdout lock.');
export const HOLDOUT_OPTIONS=Object.freeze({mode:'adaptive',maxObjects:10000,maxHops:6,maxCandidates:256,maxNeighbors:4});
export const HOLDOUT_ARMS=Object.freeze(['R5','analytical','hybrid']);
export function holdoutLockedRow(caseId){
  if(typeof caseId!=='string'||!caseId.startsWith('h:')||!frozen.has(caseId.slice(2)))throw Error('Frozen holdout case ID required.');
  return frozen.get(caseId.slice(2));
}
export function holdoutRtreLock(caseId){
  const r=holdoutLockedRow(caseId);
  return riFreeze({id:caseId,source:r.source,limits:G_MANIFEST.search.root,holdout:true,
    slot:{city:r.id,group:r.group,offset:r.offset},selectedRoadIds:r.selectedRoadIds});
}

export const HOLDOUT_SPLIT_PERMISSIONS=Object.freeze({mode:'restructure',intersection:true,split:true,merge:false,overlap:false});
