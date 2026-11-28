import {squareTournamentFrozenRow,materializeFrozenSquareTournament} from './square-trial-tournament-lock.mjs';
import {materializeSquareAdmission,SQUARE_ADMISSION_CASES} from './square-trial-recovery-admission.mjs';
import {normalizeSpatialRoadGroup} from '../../../src/core/spatial-recovery-road-adapter.js';
import {createAresDiagnosticContext} from '../../../src/core/ares-diagnostic-contract.js';
import {APP_VERSION} from '../../../src/core/version.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
import {G_MANIFEST} from './ares-p4-g-corpus.mjs';
// Exact S2b1 Fast Checks 46115429309, aggregate 140889820326,
// source 6c4353ea96abbbaf8179f28df97f64a4c4a41fe2. Canonical fingerprints from SQUARE_ADMISSION rows.
const hashes=Object.freeze({
 'radial-medium:central:control':'5f47a7b3cb54f0b70add88818a8d89881a9671b32ad0e5371546c9f37b0773d5',
 'radial-medium:central:experimental':'42f9c0bd0de6969388522290201b7240337ddc32ab416d4887095cb45172242b',
 'organic-small:central:control':'a93bc94fec416940391a2bd6e72a598fb0d117bdbde238850d990131cc6776d6',
 'organic-small:central:experimental':'f64ef2e3be9d2d8c9a55eb7d8b1bcd6cb6065a0766652a06e1d3b9ec0198ea7d',
 'linear-small:central:control':'0ce1d9b5133b0314ce4f8fb1da0af82dfe4516357aa924844b3e9b1e4a54b2a1',
 'linear-small:central:experimental':'83ad4f91379d60010fc4af1797bf72a65c04bb5cbfb201c6cf06169c4e4bec93',
 'planned-medium:central:control':'fb01daa971924ccacce1b0911bb36be4e42176d8f135f7f5bb379e0b5ae56aa4',
 'planned-medium:central:experimental':'21f9edfc659de08e0f6fa50bcb1a5e0ea898255212cc533dc30e9e60eb325d87'
});
if(Object.keys(hashes).length!==8||SQUARE_ADMISSION_CASES.some(id=>!Object.hasOwn(hashes,id)))throw Error('Incomplete square recovery lock.');
export const SQUARE_RECOVERY_CASES=Object.freeze(Object.keys(hashes).map(id=>'sq:'+id));
function load(id){
 if(typeof id!=='string'||!id.startsWith('sq:')||!Object.hasOwn(hashes,id.slice(3)))throw Error('Frozen square recovery recipe required.');
 const key=id.slice(3),f=materializeSquareAdmission(key);
 if(f.source!==hashes[key])throw Error('Square canonical source lock mismatch.');
 const lock=riFreeze({id,source:f.source,limits:G_MANIFEST.search.root,slot:{city:key,offset:f.row.offset},offset:f.row.offset,selectedRoadIds:f.row.selected,matched:f.row.matched,squareTrial:true});
 return {f,lock};
}
export function squareRecoveryLockedRow(id){
 if(typeof id==='string'&&id.startsWith('sq:tournament:')){const r=squareTournamentFrozenRow(id);return riFreeze({...r,limits:G_MANIFEST.search.root,slot:{city:r.city,offset:r.offset},squareTrial:true});}
 return load(id).lock;
}
export function materializeSquareRecoveryCase(id){
 const lock=squareRecoveryLockedRow(id),project=id.startsWith('sq:tournament:')?materializeFrozenSquareTournament(id):load(id).f.project;
 const operation=normalizeSpatialRoadGroup(project,1,[...lock.selectedRoadIds],lock.offset,G_MANIFEST.permissions);
 const context=createAresDiagnosticContext({version:1,sessionId:id,sourceVersion:APP_VERSION,operation});
 return {project,context,limits:lock.limits};
}
