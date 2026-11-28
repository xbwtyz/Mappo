import {readFileSync} from 'node:fs';
import {TOURNAMENT_MANIFEST,tournamentRecipe} from './ares-p5-tournament-inventory.mjs';
import {HOLDOUT_MANIFEST} from './ares-p5-holdout-inventory.mjs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {G_MANIFEST} from './ares-p4-g-corpus.mjs';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
const frozen=new Map(),sources=new Set(HOLDOUT_MANIFEST.rows.map(r=>holdoutLockedRow('h:'+r.id).source));
const jobs=new Set([140871460835,140871460846,140871460847,140871460857,140871460865,140871460873,140871460879,140871460888,140871460902,140871460908,140871460927,140871460931,140871460942,140871460972,140871460990,140871460995]);
for(const morphology of TOURNAMENT_MANIFEST.morphologies){
 const e=JSON.parse(readFileSync(new URL('../../../tests/fixtures/ares-p5-tournament-lock-'+morphology+'.json',import.meta.url),'utf8'));
 if(e.version!==1||e.run!==46110054733||e.attempt!==1||e.source!=='d474e92e61319f507446fab2d8b24242228b1efe'||e.aggregate!==140873277671||e.rows.length!==25)throw Error('Tournament lock evidence identity mismatch.');
 for(const {job,row} of e.rows){
  const recipe=tournamentRecipe(row.id);
  if(!jobs.has(job)||frozen.has(row.id)||sources.has(row.source)||!(/^[0-9a-f]{64}$/).test(row.source)||row.options.morphology!==morphology||JSON.stringify(recipe.options)!==JSON.stringify(row.options)||JSON.stringify(recipe.offset)!==JSON.stringify(row.offset)||recipe.preferredGroup!==row.preferredGroup||row.selection!=='selected'||!Array.isArray(row.selectedRoadIds)||row.selectedRoadIds.length<4||row.selectedRoadIds.length>8||new Set(row.selectedRoadIds).size!==row.selectedRoadIds.length)throw Error('Invalid tournament lock.');
  frozen.set(row.id,riFreeze(row));sources.add(row.source);
 }
}
if(frozen.size!==100||sources.size!==200)throw Error('Incomplete or overlapping tournament lock.');
export const TOURNAMENT_CASES=Object.freeze([...frozen.keys()].map(id=>'t:'+id).sort(riCompare));
export function tournamentLockedRow(id){
 if(typeof id!=='string'||!id.startsWith('t:')||!frozen.has(id.slice(2)))throw Error('Frozen tournament case ID required.');
 return frozen.get(id.slice(2));
}
export function tournamentRtreLock(id){
 const r=tournamentLockedRow(id);
 return riFreeze({id,source:r.source,limits:G_MANIFEST.search.root,tournament:true,slot:{city:r.id,group:r.group,offset:r.offset},selectedRoadIds:r.selectedRoadIds});
}
