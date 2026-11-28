import test from 'node:test';
import assert from 'node:assert/strict';
import {observeP5Topology} from '../scripts/development/research/ares-p5-topology-observe.mjs';
import {RADIAL_IDS} from '../scripts/development/research/ares-p4x-radial-scope.mjs';
const permissions={mode:'restructure',intersection:true,split:true,merge:false,overlap:false};
for(const id of RADIAL_IDS.filter(id=>id!=='radial-small:eight-loop:50:y'))test('P5 residual radial read-only closure '+id,async()=>{
  const r=await observeP5Topology('g:'+id,permissions);
  console.log('ARES_P5_AB2 '+JSON.stringify(r));
  assert.equal(r.authority,'none');assert.equal(r.topologyChanged,false);
  assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
  assert.ok(r.scope.admittedCount<=10000);assert.ok(r.conflicts.length>0);
  for(const c of r.conflicts){
    if(c.status==='research-contact-only'){assert.equal(r.scope.mandatoryComplete,true);assert.deepEqual(c.reasons,[]);assert.deepEqual(c.endpointExclusions,[]);}
    else assert.ok(c.reasons.length>0);
  }
});
