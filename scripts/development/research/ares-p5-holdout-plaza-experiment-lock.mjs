import {readFileSync} from 'node:fs';
import {holdoutLockedRow} from './ares-p5-holdout-lock.mjs';
import {riFreeze,riCompare} from '../../../src/core/road-impact-model.js';
const rows=new Map();
for(const job of [140862894658,140862894664,140862894670,140862894684,140862894685,140862894688,140862894692,140862894699,140862894701,140862894703,140862894707,140862894716,140862894722,140862894749,140862894756,140862894842]){
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-plaza-46107302370-'+job+'.json',import.meta.url),'utf8'));
 if(e.run!==46107302370||e.attempt!==1||e.source!=='2231c902e053261f28e4c6f1825c126c5ccf3b92'||e.job!==job)throw Error('Plaza experiment archive identity mismatch.');
 for(const r of e.rows){const lock=holdoutLockedRow(r.caseId);if(rows.has(r.caseId)||r.source!==lock.source||r.authority!=='none'||r.status!=='diagnosed'||!['verified','unresolved','boundary-refused'].includes(r.expandedOutcome))throw Error('Plaza experiment row mismatch.');rows.set(r.caseId,riFreeze(r));}
}
export const PLAZA_EXPERIMENT_CASES=Object.freeze([...rows.values()].filter(x=>x.expandedOutcome!=='boundary-refused').map(x=>x.caseId).sort(riCompare));
if(rows.size!==100||PLAZA_EXPERIMENT_CASES.length!==49||[...rows.values()].filter(r=>r.expandedOutcome==='verified').length!==23)throw Error('Plaza experiment inventory mismatch.');
export function plazaExperimentCase(caseId,arm){
 if(!PLAZA_EXPERIMENT_CASES.includes(caseId)||!['strict','plaza-attached'].includes(arm))throw Error('Frozen plaza experiment case and arm required.');
 return rows.get(caseId);
}
export function plazaExperimentSeed(caseId){
 if(caseId!=='h:radial-12')throw Error('Frozen plaza precision case required.');
 const e=JSON.parse(readFileSync(new URL('../../../docs/research/evidence/holdout-adaptive-contact-46106985271-140861879521.json',import.meta.url),'utf8'));
 if(e.run!==46106985271||e.attempt!==1||e.source!=='be3f6f4c0207ddf587614fe05ac8adbdcb77a2c3'||e.job!==140861879521||e.rows.length!==1)throw Error('Plaza precision archive mismatch.');
 const r=e.rows[0],lock=holdoutLockedRow(caseId),s=r.best;
 if(r.caseId!==caseId||r.source!==lock.source||r.authority!=='none'||r.profile.cap!==8||r.profile.multiplier!==1||s?.score!==1011||s.blocking!==1||s.contacts!==11||s.neighbors.length!==7||r.seeds.length||r.geometrySeeds.length||!r.adaptive.rounds.some(x=>x.starts.some(y=>y.score===1011&&JSON.stringify(y.pairs)===JSON.stringify([['RD-0278','RD-0286']]))))throw Error('Plaza precision seed mismatch.');
 return riFreeze({recipe:{source:lock.source,cap:8,minimum:7},seed:{arm:'plaza-precision-locked',best:{neighbors:s.neighbors,expectedContactCount:11,requiredPair:['RD-0278','RD-0286']}}});
}
