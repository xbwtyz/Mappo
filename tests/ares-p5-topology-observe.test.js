import test from 'node:test';
import assert from 'node:assert/strict';
import {observeP5Topology} from '../scripts/development/research/ares-p5-topology-observe.mjs';
const all={mode:'restructure',intersection:true,split:true,merge:false,overlap:false};
for(const id of ['g:radial-small:eight-loop:50:y','g:linear-medium:eight-chain:100:diagonal'])test('P5 frozen read-only contact evidence '+id,async()=>{
  const r=await observeP5Topology(id,all);
  console.log('ARES_P5_AB2 '+JSON.stringify(r));
  assert.equal(r.caseId,id);assert.equal(r.authority,'none');assert.equal(r.topologyChanged,false);
  assert.equal(r.version,2);assert.ok(r.scope.admittedCount<=10000);assert.ok(r.scope.omittedRefs.length>0);assert.equal(r.scope.wholeNeighborhoodComplete,false);assert.equal(r.scope.mandatoryComplete,true);assert.ok(r.conflicts.every(c=>c.originalWholeNeighborhoodGate==='blocked'));
  if(id.includes('linear-medium'))assert.equal(r.conflicts.filter(c=>c.status==='research-contact-only').length,9);
  if(id.includes('radial-small')){assert.equal(r.conflicts.filter(c=>c.status==='research-contact-only').length,1);assert.ok(r.conflicts.some(c=>c.status==='blocked'&&c.endpointExclusions.length>0));}
  assert.match(r.source,/^[a-f0-9]{64}$/);assert.ok(r.conflicts.length>0);
  assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
  assert.ok(Object.isFrozen(r));assert.ok(r.conflicts.every(c=>['blocked','research-contact-only'].includes(c.status)));
  assert.ok(r.conflicts.every(c=>c.status==='blocked'||(['interior-interior','endpoint-interior'].includes(c.contact.kind)&&c.reasons.length===0)));
  const deny=await observeP5Topology(id,{...all,mode:'adaptive'});
  assert.equal(deny.source,r.source);assert.deepEqual(deny.requested,r.requested);
  assert.deepEqual(deny.conflicts.map(c=>c.contact),r.conflicts.map(c=>c.contact));
  assert.ok(deny.conflicts.every(c=>c.status==='blocked'&&c.reasons.includes('restructure-required')));
});
test('P5 rejects non-recipe and unexpected permission fields',async()=>{
  await assert.rejects(observeP5Topology({},all),/Frozen RTRE recipe/);
  await assert.rejects(observeP5Topology('g:unknown',all),/Unknown frozen/);
  await assert.rejects(observeP5Topology('g:radial-small:eight-loop:50:y',{...all,destruction:true}),/Explicit/);
});
