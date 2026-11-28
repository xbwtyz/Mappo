import test from 'node:test';
import assert from 'node:assert/strict';
import {constructP5SplitPilot} from '../scripts/development/research/ares-p5-topology-observe.mjs';
import {auditP5SplitPilot,equalP5GraphRecord} from '../scripts/development/research/ares-p5-topology-audit.mjs';
import {createSpatialPreservationBudget} from '../src/core/spatial-recovery-contract.js';
const permissions={mode:'restructure',intersection:true,split:true,merge:false,overlap:false};
for(const [id,count] of [['g:radial-small:eight-loop:100:x',5],['g:linear-medium:eight-chain:100:diagonal',9]])test('P5 C2 independently reconstruct and audit '+id,async()=>{
  const c=await constructP5SplitPilot(id,permissions);
  assert.equal(c.status,'graph-candidate');
  const r=await auditP5SplitPilot(id,permissions,c);
  console.log('ARES_P5_C2B '+JSON.stringify(r));
  assert.equal(r.source,c.source);assert.equal(r.authority,'none');assert.equal(r.contacts,count);
  assert.ok(r.pairComparisons>0);assert.ok(r.stats.work<=8000000);assert.ok(r.stats.expansions<=32768);
  assert.equal(r.splitParents,c.witness.lineage.length);
  assert.ok(!['node-preservation','road-preservation','new-node-preservation','child-road-preservation'].includes(r.reason));
  if(r.status==='rejected')assert.ok(['boundary-escape','child-boundary','final-constraint-blocked'].includes(r.reason));
  assert.ok(['topology-final-verified','rejected'].includes(r.status));
  if(r.status==='topology-final-verified'){
    assert.deepEqual(r.finalBlockers,[]);assert.ok(r.finalChecks>=3*c.witness.translatedRoadIds.length);
    assert.equal(r.sweptChecks,3*c.witness.translatedRoadIds.length);
    assert.equal(r.reason,r.sweptUnresolved.length?'swept-unresolved':null);
  }else assert.ok(r.reason);
  const denied=await auditP5SplitPilot(id,{...permissions,mode:'adaptive'},c);
  assert.equal(denied.status,'rejected');assert.equal(denied.reason,'permission');
  const missing=structuredClone(c);missing.witness.contacts.pop();
  const m=await auditP5SplitPilot(id,permissions,missing);assert.equal(m.status,'rejected');assert.equal(m.reason,'contact-inventory');
  const moved=structuredClone(c);moved.witness.requested[0].point.x+=1;
  const n=await auditP5SplitPilot(id,permissions,moved);assert.equal(n.status,'rejected');assert.equal(n.reason,'exact-intent');
  const bad=structuredClone(c);bad.witness.lineage[0].children[0].id='RD-FAKE';
  const l=await auditP5SplitPilot(id,permissions,bad);assert.equal(l.status,'rejected');assert.equal(l.reason,'road-lineage-or-reservation');
  const foreign=structuredClone(c);foreign.source='0'.repeat(64);
  const f=await auditP5SplitPilot(id,permissions,foreign);assert.equal(f.status,'rejected');assert.equal(f.reason,'witness-source');
});

test('P5 graph record equality is order independent, not value or metadata independent',()=>{
  const b=createSpatialPreservationBudget({work:8000000,stateExpansions:32768});
  const a={id:'RD-1',a:'N-1',b:'N-2',kind:'lane',meta:{x:-0,values:[1,2]}};
  const reordered={kind:'lane',b:'N-2',a:'N-1',id:'RD-1',meta:{values:[1,2],x:-0}};
  assert.equal(equalP5GraphRecord(a,reordered,b),true);
  assert.equal(equalP5GraphRecord(a,{...reordered,kind:'primary'},b),false);
  assert.equal(equalP5GraphRecord(a,{...reordered,meta:{values:[1,2],x:0}},b),false);
  assert.equal(equalP5GraphRecord(a,{...reordered,meta:{values:[2,1],x:-0}},b),false);
  assert.equal(equalP5GraphRecord(a,{...reordered,meta:{values:[1,2]}},b),false);
  assert.equal(equalP5GraphRecord(a,{...reordered,meta:{values:[1,2],x:-0,extra:true}},b),false);
  assert.equal(equalP5GraphRecord(a,{...reordered,a:'N-3'},b),false);
  assert.ok(b.snapshot().work>0);
});
