import test from 'node:test';
import assert from 'node:assert/strict';
import {observeP6LockedDryPipeline,bindP6RoadRecords} from '../scripts/development/research/ares-p6-locked-pipeline.mjs';
import {P6_A_CASES} from '../scripts/development/research/ares-p6-ownership-observe.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
import {createHash} from 'node:crypto';
import {aresReplayJson} from '../src/core/ares-diagnostic-replay.js';
const root=()=>createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
for(const id of P6_A_CASES)test('P6 locked pipeline '+id,async()=>{
 const r=await observeP6LockedDryPipeline(id);
 assert.equal(r.authority,'none');assert.equal(r.valid,false);assert.equal(r.landVerified,false);
 if(id==='t:t-radial-01'){assert.equal(r.status,'road-refused');assert.equal(r.pipeline,undefined);return;}
 assert.equal(r.roadAudit,'topology-final-verified',JSON.stringify(r));
 assert.ok(r.bindingMatched,JSON.stringify(r));
 assert.ok(['diagnostics-complete','pipeline-refused','work-limit'].includes(r.status));
 assert.ok(r.stats.work<=8000000);
 if(r.pipeline){assert.equal(r.sourceUnchanged,true);assert.equal(r.pipeline.valid,false);assert.equal(r.pipeline.authority,'none');}
 console.log('P6_LOCKED_PIPELINE '+JSON.stringify({id,status:r.status,reason:r.pipeline?.reason??r.reason,bindingWork:r.bindingWork,work:r.stats.work,roadAuditWork:r.roadAuditWork,ledger:r.pipeline?.ledger,districts:r.pipeline?.districts,defenses:r.pipeline?.defenses,authority:'none'}));
});
test('P6 locked pipeline refuses arbitrary recipes and detects changed graph records',async()=>{
 await assert.rejects(observeP6LockedDryPipeline('t:t-planned-14'));
 const city={nodes:[{id:'a',x:0,y:0},{id:'b',x:1,y:0}],roads:[{id:'r',a:'a',b:'b',kind:'lane'}]};
 const w={requested:[{ref:{id:'a'},point:{x:2,y:3}}],neighbors:[],lineage:[],contacts:[]};
 const expected=createHash('sha256').update(aresReplayJson({nodes:[{id:'a',x:2,y:3},city.nodes[1]],roads:city.roads})).digest('hex');
 assert.equal(bindP6RoadRecords(city,w,expected,root()).status,'matched');
 const tampered={...w,requested:[{ref:{id:'a'},point:{x:2,y:4}}]};
 const r=bindP6RoadRecords(city,tampered,expected,root());
 assert.equal(r.status,'mismatch');assert.equal(r.candidate,undefined);
});
