import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { materializeLockedRtreCase } from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
import { referenceP2Scope,P2_AUDIT_CASES } from '../scripts/development/research/ares-p4r-p2-depth-audit.mjs';
import { createSpatialPreservationBudget,spatialRefKey } from '../src/core/spatial-recovery-contract.js';

// Regression only: import the actual checked-in module in an isolated
// module instance, changing only its static relative import specifiers
// and adding a test-only export. No runtime module change and no reuse of
// the synthetic scope as authentic project evidence or Apply authority.
const url=new URL('../src/core/ares-adaptation-scope.js',import.meta.url);
const source=readFileSync(url,'utf8');
const hash=createHash('sha256').update(source).digest('hex');
const instrumented=source.replace(/from '(\.\/[^']+)'/g,(_,path)=>"from '"+new URL(path,url).href+"'")+"\nexport { buildAresScope as diagnosticBuildAresScope };\n";
const {diagnosticBuildAresScope:build}=await import('data:text/javascript;base64,'+Buffer.from(instrumented).toString('base64'));
const {context}=materializeLockedRtreCase(P2_AUDIT_CASES[0]);
const r=(collection,id)=>({collection,id});
const p=r('properties','P'),a=r('buildings','A'),b=r('buildings','B'),c=r('buildings','C'),d=r('buildings','D');
const edge=(from,to,relation)=>({from,to,relation});
const observation=(protectedC=false)=>({
  status:'observed',snapshotFingerprint:'synthetic-diagnostic-only',roots:[p,c],
  nodes:[p,a,b,c,d].map(ref=>({ref,classification:protectedC&&ref===c?'protected':'review-candidate',reason:'synthetic'})),
  discovery:{changedRoads:[],blockers:[{propertyRef:p}],diagnostics:[]},
  edges:[edge(p,a,'building'),edge(a,b,'courtyard-occupant'),edge(b,c,'courtyard-occupant'),edge(c,d,'courtyard-occupant')]
});
function compare(o,hops,feedback=null){
  const budget=createSpatialPreservationBudget(),auditBudget=createSpatialPreservationBudget();
  const actual=build(o,context,{maxObjects:10000,maxHops:hops},budget,feedback),expected=referenceP2Scope(o,hops,auditBudget);
  const actualRows=actual.entries.map(e=>({id:e.ref.id,depth:e.depth,role:e.role}));
  const expectedRows=o.nodes.filter(n=>expected.observed.has(spatialRefKey(n.ref))).map(n=>({id:n.ref.id,depth:expected.observed.get(spatialRefKey(n.ref)),expansionDepth:expected.expansion.get(spatialRefKey(n.ref))??null,role:n.classification==='protected'?'protected':expected.expansion.has(spatialRefKey(n.ref))?'review-candidate':'observe-only'}));
  const wrong=actualRows.filter(a=>!expectedRows.some(e=>e.id===a.id&&e.depth===a.depth&&e.role===a.role));
  const missing=expectedRows.filter(e=>!actualRows.some(a=>a.id===e.id&&a.depth===e.depth&&a.role===e.role));
  const result={sourceHash:hash,hops,actualStatus:actual.status,actualRows,expectedRows,wrong,missing,actualOmitted:actual.unresolvedRefs.map(spatialRefKey).sort(),expectedOmitted:[...expected.omitted].sort(),reviewRefs:actual.reviewRefs.map(spatialRefKey).sort(),stats:budget.snapshot(),auditStats:auditBudget.snapshot()};
  console.log('ARES_P4R_P2_KERNEL '+JSON.stringify(result));
  assert.ok(actual.entries.every(e=>e.depth<=hops));
  assert.equal(actual.context,context);
  assert.deepEqual(wrong,[]);assert.deepEqual(missing,[]);
  assert.deepEqual(result.actualOmitted,result.expectedOmitted);
  if(expected.omitted.size){
    assert.equal(actual.status,'scope-limited');assert.deepEqual(actual.reviewRefs,[]);
  }else{
    assert.equal(actual.status,'observed');
    assert.deepEqual(result.reviewRefs,[...expected.expansion.keys()].sort());
  }
  return result;
}
test('P2 actual kernel regression: shallow observation cannot justify over-depth promotion',()=>{
  const short=compare(observation(),2),long=compare(observation(),3);
  assert.equal(short.actualRows.find(e=>e.id==='C').role,'observe-only');
  assert.equal(short.actualRows.some(e=>e.id==='D'),false);
  assert.equal(long.actualRows.find(e=>e.id==='C').role,'review-candidate');
  assert.equal(long.actualRows.find(e=>e.id==='C').depth,0);
  assert.equal(long.actualRows.some(e=>e.id==='D'),false);
  assert.deepEqual(long.actualOmitted,[spatialRefKey(d)]);
});
test('P2 actual kernel: zero-hop and exact four-hop boundaries',()=>{
  const zero=compare(observation(),0),four=compare(observation(),4);
  assert.equal(zero.actualRows.find(e=>e.id==='C').role,'observe-only');
  assert.equal(four.actualRows.find(e=>e.id==='D').depth,4);
  assert.equal(four.actualRows.find(e=>e.id==='D').role,'review-candidate');
});
test('P2 actual kernel: integrated contact root does not shortcut ownership depth',()=>{
  const base=observation(),withoutContactRoot={...base,roots:[p]};
  const feedback={contactRefs:[c],finalViolations:[],finalUnresolved:[],diagnostics:[]};
  // Expected oracle has C as the same read-only contact root. For actual
  // exercise the integrated contact path rather than ordinary roots.
  for(const hops of [2,3,4]){
    const actual=build(withoutContactRoot,context,{maxObjects:10000,maxHops:hops},createSpatialPreservationBudget(),feedback);
    const expected=referenceP2Scope(base,hops,createSpatialPreservationBudget());
    assert.deepEqual(actual.entries.map(e=>spatialRefKey(e.ref)).sort(),[...expected.observed.keys()].sort());
    assert.deepEqual(actual.entries.filter(e=>e.role==='review-candidate').map(e=>spatialRefKey(e.ref)).sort(),[...expected.expansion.keys()].sort());
    for(const e of actual.entries)assert.equal(e.depth,expected.observed.get(spatialRefKey(e.ref)));
    assert.deepEqual(actual.unresolvedRefs.map(spatialRefKey).sort(),[...expected.omitted].sort());
    if(expected.omitted.size)assert.deepEqual(actual.reviewRefs,[]);
  }
});
test('P2 actual kernel: protected shallow root must never expand',()=>{
  const result=compare(observation(true),2);
  assert.equal(result.actualRows.find(e=>e.id==='C').role,'protected');
  assert.equal(result.actualRows.some(e=>e.id==='D'),false);
  assert.deepEqual(result.wrong,[]);assert.deepEqual(result.missing,[]);
});
