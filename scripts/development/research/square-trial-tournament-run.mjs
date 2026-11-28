import assert from 'node:assert/strict';
import {squareTournamentFrozenRow,materializeFrozenSquareTournament} from './square-trial-tournament-lock.mjs';
import {searchSquareTrialRecovery} from './ares-p5-holdout-plaza-recovery.mjs';
import {measureSquareTrialDirect} from './square-trial-movement-pilot.mjs';
import {buildRoadGraph} from '../../../src/core/road-graph.js';
import {aresReplayJson} from '../../../src/core/ares-diagnostic-replay.js';
import {riFreeze} from '../../../src/core/road-impact-model.js';
export async function runSquareTournamentCase(id){
 const lock=squareTournamentFrozenRow(id),p=materializeFrozenSquareTournament(id),before=aresReplayJson(p),g=buildRoadGraph(p.city);
 assert.ok(g.valid);
 // Same strict direct road baseline as S2a; not an independent P5 audit.
 const direct=measureSquareTrialDirect(p.city,g,{status:'selected',ids:lock.selectedRoadIds},lock.offset,p.city.survey.boundary);
 assert.equal(aresReplayJson(p),before);
 const r=await searchSquareTrialRecovery(id);
 assert.equal(r.authority,'none');assert.equal(r.source,lock.source);
 assert.ok(['verified','refused','unverified','work-limit','boundary-refused','preflight-refused'].includes(r.status));
 assert.ok(r.stats.work<=8000000&&r.stats.expansions<=32768);
 assert.ok(r.attempts<=47&&r.localProbes<=192);
 if(direct.status==='boundary-refused')assert.equal(r.status,'boundary-refused');
 const w=r.construction?.witness,a=r.audit;
 if(a)assert.ok(a.stats.work<=8000000&&a.stats.expansions<=32768);
 if(r.status==='verified'){
  assert.equal(a.status,'topology-final-verified');assert.equal(a.sweptUnresolved.length,0);
  assert.ok(w&&w.neighbors.length<=8);
  if(lock.hub)assert.equal(a.hub.status,'hub-verified');
 }
 // Compact evidence for all attempts, including refusals. No retry, no
 // selection changes, no result-conditioned inclusion. The witness is
 // produced and independently checked inside the existing P5 entry point.
 const row={id,source:lock.source,city:lock.city,arm:lock.arm,offset:lock.offset,matched:lock.matched,
  adaptiveMatchedControl:lock.adaptiveMatchedControl,adaptiveMatchedExperimental:lock.adaptiveMatchedExperimental,
  direct:direct.status,directIssues:direct.issues??[],status:r.status,reason:r.reason,authority:r.authority,
  attempts:r.attempts,localProbes:r.localProbes,work:r.stats.work,expansions:r.stats.expansions,
  minimum:r.minimum?{status:r.minimum.status,minimum:r.minimum.minimum,lower:r.minimum.lower,emptyClauses:r.minimum.plain?.emptyClauses??null}:null,
  neighbors:w?.neighbors?.length??null,contacts:w?.contacts?.length??null,
  audit:a?{status:a.status,reason:a.reason,work:a.stats.work,expansions:a.stats.expansions,sweptUnresolved:a.sweptUnresolved.length,
    finalBlockers:a.finalBlockers.length,hub:a.hub??null}:null};
 return riFreeze(row);
}
