import {readFileSync} from 'node:fs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {riFreeze} from '../../../src/core/road-impact-model.js';
// Freeze one candidate before audit (first qualifying proposal; no retry).
// The archive contains two candidates, but only attempt 1 is dispatched.
export function holdoutEBSeed(caseId){
 if(caseId!=='h:radial-24')throw Error('Frozen P5 E-B case required.');
 const lock=holdoutLockedRow(caseId);
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-coupled-angular-46104471979-140854068133.json',import.meta.url),'utf8'));
 if(e.run!==46104471979||e.attempt!==1||e.source!=='ee535e92a1b21e5555b5b29158938793bfd1eabc'||e.job!==140854068133||e.rows.length!==1)throw Error('E-B archive identity mismatch.');
 const row=e.rows[0],seed=row.seeds[0];
 if(row.caseId!==caseId||row.source!==lock.source||row.authority!=='none'||row.category!=='split-seeds-found'||JSON.stringify(row.offset)!==JSON.stringify(lock.offset)||row.seeds.length!==2||row.rotationRefused!==0||seed.attempt!==1||seed.arm!=='coupled-angular-event'||seed.neighbors.length!==4||new Set(seed.neighbors.map(n=>n.id)).size!==4||seed.pairs.length!==10||seed.pairs.some(p=>p.code!=='unnormalized-crossing'))throw Error('E-B frozen seed mismatch.');
 return riFreeze({recipe:{source:lock.source,cap:4,minimum:4},seed:{arm:seed.arm,best:{neighbors:seed.neighbors,pairs:seed.pairs}}});
}
