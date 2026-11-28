import {readFileSync} from 'node:fs';
import {holdoutLockedRow,HOLDOUT_OPTIONS} from './ares-p5-holdout-lock.mjs';
import {riFreeze} from '../../../src/core/road-impact-model.js';
export const REFORM_AUDIT_ARMS=riFreeze(["c8-d100","c8-d125","c8-d150"]);
const profiles=riFreeze({'c8-d100':1,'c8-d125':1.25,'c8-d150':1.5});
export function reformAuditSeed(caseId,arm){
 if(caseId!=='h:linear-09'||!REFORM_AUDIT_ARMS.includes(arm))throw Error('Frozen reform audit case and arm required.');
 const lock=holdoutLockedRow(caseId),job=({"c8-d125":140855972451,"c8-d150":140855972464,"c8-d100":140855972471})[arm];
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-reform-46105076686-'+job+'.json',import.meta.url),'utf8'));
 if(e.run!==46105076686||e.source!=='26de6242316fa78a545375ed15c83f384bf8909c'||e.attempt!==1||e.job!==job)throw Error('Reform archive identity mismatch.');
 const matches=e.rows.filter(x=>x.caseId===caseId&&x.profile.id===arm);
 if(matches.length!==1)throw Error('Reform audit row missing.');
 const row=matches[0],seed=row.geometrySeeds[0],multiplier=profiles[arm];
 if(row.source!==lock.source||JSON.stringify(row.offset)!==JSON.stringify(lock.offset)||row.authority!=='none'||row.profile.cap!==8||row.profile.multiplier!==multiplier||row.category!=='geometry-seeds-found'||row.geometrySeeds.length!==2||row.seeds.length||!Number.isSafeInteger(seed.attempt)||seed.attempt<1||seed.attempt>48||seed.neighbors.length!==5||new Set(seed.neighbors.map(n=>n.id)).size!==5)throw Error('Frozen reform witness mismatch.');
 return riFreeze({source:lock.source,arm,multiplier,options:{...HOLDOUT_OPTIONS,maxNeighbors:8},neighbors:seed.neighbors,attempt:seed.attempt});
}
