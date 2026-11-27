import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { materializeLockedRtreCase } from '../scripts/development/research/ares-rtre-locked-recipes.mjs';
import { referenceP2Scope,P2_AUDIT_CASES } from '../scripts/development/research/ares-p4r-p2-depth-audit.mjs';
import { createSpatialPreservationBudget,spatialRefKey } from '../src/core/spatial-recovery-contract.js';

// Diagnostic only: import the actual checked-in module in an isolated
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
function compare(o,hops){
  const budget=createSpatialPreservationBudget(),auditBudget=createSpatialPreservationBudget();
  const actual=build(o,context,{maxObjects:10000,maxHops:hops},budget),expected=referenceP2Scope(o,hops,auditBudget);
  const actualRows=actual.entries.map(e=>({id:e.ref.id,depth:e.depth,role:e.role}));
  const expectedRows=o.nodes.filter(n=>expected.observed.has(spatialRefKey(n.ref))).map(n=>({id:n.ref.id,depth:expected.observed.get(spatialRefKey(n.ref)),expansionDepth:expected.expansion.get(spatialRefKey(n.ref))??null,role:n.classification==='protected'?'protected':expected.expansion.has(spatialRefKey(n.ref))?'review-candidate':'observe-only'}));
  const wrong=actualRows.filter(a=>!expectedRows.some(e=>e.id===a.id&&e.depth===a.depth&&e.role===a.role));
  const missing=expectedRows.filter(e=>!actualRows.some(a=>a.id===e.id&&a.depth===e.depth&&a.role===e.role));
  const result={sourceHash:hash,hops,actualStatus:actual.status,actualRows,expectedRows,wrong,missing,actualOmitted:actual.unresolvedRefs.map(r=>r.id),expectedOmitted:[...expected.omitted],stats:budget.snapshot(),auditStats:auditBudget.snapshot()};
  console.log('ARES_P4R_P2_KERNEL '+JSON.stringify(result));
  assert.ok(actual.entries.every(e=>e.depth<=hops));
  assert.equal(actual.context,context);
  // Mismatches are diagnostic results; do not lock in erroneous behavior
  // as a passing production contract or declare the safety gate qualified.
  return result;
}
test('P2 actual kernel: shallow observation cannot justify over-depth promotion (diagnostic)',()=>{
  const short=compare(observation(),2),long=compare(observation(),3);
  assert.equal(short.expectedRows.find(e=>e.id==='C').role,'observe-only');
  assert.equal(short.expectedRows.some(e=>e.id==='D'),false);
  assert.equal(long.expectedRows.find(e=>e.id==='C').expansionDepth,3);
  assert.equal(long.expectedRows.some(e=>e.id==='D'),false);
});
test('P2 actual kernel: protected shallow root must never expand',()=>{
  const result=compare(observation(true),2);
  assert.equal(result.actualRows.find(e=>e.id==='C').role,'protected');
  assert.equal(result.actualRows.some(e=>e.id==='D'),false);
  assert.deepEqual(result.wrong,[]);assert.deepEqual(result.missing,[]);
});
