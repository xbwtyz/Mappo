import {readFileSync} from 'node:fs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {riFreeze} from '../../../src/core/road-impact-model.js';
// One fixed candidate, earliest qualifying attempt. No fallback.
export function holdoutPrecisionSeed(caseId){
 if(caseId!=='h:radial-16')throw Error('Frozen precision audit case required.');
 const lock=holdoutLockedRow(caseId);
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-precision-contact-46106182826-140859416624.json',import.meta.url),'utf8'));
 if(e.run!==46106182826||e.attempt!==1||e.source!=='d4683f04dead41407fdc5c578e55dd2a822fac63'||e.job!==140859416624||e.rows.length!==1)throw Error('Precision audit archive identity mismatch.');
 const row=e.rows[0],seed=row.seeds[0];
 if(row.caseId!==caseId||row.source!==lock.source||row.authority!=='none'||row.category!=='split-seeds-found'||JSON.stringify(row.offset)!==JSON.stringify(lock.offset)||row.profile.cap!==8||row.profile.multiplier!==1||row.seeds.length!==2||row.rotationRefused!==0||seed.attempt!==2||seed.arm!=='precision-contact-event'||seed.neighbors.length!==8||new Set(seed.neighbors.map(n=>n.id)).size!==8||seed.neighbors.some(n=>n.id==='N-0089')||seed.pairs.length!==19||seed.pairs.some(p=>p.code!=='unnormalized-crossing'||p.roadIds.includes('RD-0099')&&p.roadIds.includes('RD-0221')))throw Error('Precision frozen seed mismatch.');
 return riFreeze({recipe:{source:lock.source,cap:8,minimum:8},seed:{arm:seed.arm,best:{neighbors:seed.neighbors,pairs:seed.pairs}}});
}
